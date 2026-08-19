const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const SERVER = path.resolve(__dirname, '../src/mcp-server.js');

function startServer() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'symbiosis-srv-')));
  const root = path.join(base, 'workspace');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'const a = 1;\n');

  const proc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, SYMBIOSIS_WORKSPACE: root, SYMBIOSIS_KNOWLEDGE_PATH: path.join(base, 'knowledge') },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const frames = [];
  const waiters = [];
  readline.createInterface({ input: proc.stdout }).on('line', line => {
    const msg = JSON.parse(line); // falha o teste se algo que não seja JSON-RPC sair no stdout
    frames.push(msg);
    waiters.splice(0).forEach(check => check());
  });

  function waitFor(predicate, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      const check = () => {
        const found = frames.find(predicate);
        if (found) {
          clearTimeout(timer);
          resolve(found);
        } else {
          waiters.push(check);
        }
      };
      check();
    });
  }

  let nextId = 1;
  async function call(method, params) {
    const id = nextId++;
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return waitFor(m => m.id === id);
  }

  return { proc, root, frames, waitFor, call, notify: (method) => proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n') };
}

test('servidor MCP: handshake, ferramentas e notificações do watcher', async (t) => {
  const s = startServer();
  t.after(() => s.proc.kill());

  const init = await s.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'teste', version: '0' } });
  assert.strictEqual(init.result.serverInfo.name, 'antigravity-symbiosis');
  assert.ok(init.result.capabilities.logging, 'Declara capacidade de logging (usada nas notificações)');
  s.notify('notifications/initialized');

  const list = await s.call('tools/list');
  assert.deepStrictEqual(
    list.result.tools.map(tool => tool.name),
    ['symbiosis_get_context', 'symbiosis_read_file', 'symbiosis_edit_file', 'symbiosis_run_command']
  );

  const ctx = await s.call('tools/call', { name: 'symbiosis_get_context', arguments: {} });
  const state = JSON.parse(ctx.result.content[0].text);
  assert.strictEqual(state.workspace, s.root);
  assert.deepStrictEqual(state.entries, ['src/']);
  assert.ok(!/simulated/i.test(ctx.result.content[0].text), 'Contexto não é texto fixo');

  const outside = await s.call('tools/call', { name: 'symbiosis_edit_file', arguments: { path: '../x', content: 'x' } });
  assert.strictEqual(outside.result.isError, true);

  // Edição do agente: não deve gerar notificação de "mudança externa".
  const edit = await s.call('tools/call', { name: 'symbiosis_edit_file', arguments: { path: 'src/app.js', content: 'const a = 2;\n' } });
  assert.ok(!edit.result.isError, edit.result.content[0].text);

  // Edição externa (humano/IDE): deve gerar notifications/message.
  await new Promise(r => setTimeout(r, 200));
  fs.writeFileSync(path.join(s.root, 'humano.js'), 'const h = 1;\n');
  const note = await s.waitFor(m => m.method === 'notifications/message');
  assert.strictEqual(note.params.logger, 'symbiosis-watcher');
  const changed = note.params.data.changes.map(c => c.path);
  assert.ok(changed.includes('humano.js'), `Mudança externa notificada: ${changed}`);
  assert.ok(!changed.includes('src/app.js'), 'Edição do próprio agente não é notificada como externa');

  const ctx2 = await s.call('tools/call', { name: 'symbiosis_get_context', arguments: {} });
  const recent = JSON.parse(ctx2.result.content[0].text).recentChanges;
  assert.ok(recent.some(c => c.path === 'humano.js' && c.origin === 'external'));

  const bad = await s.call('tools/call', { name: 'symbiosis_run_command', arguments: { command: 'git status\ntouch pwned' } });
  assert.strictEqual(bad.result.isError, true);
  assert.ok(!fs.existsSync(path.join(s.root, 'pwned')));

  const unknown = await s.call('nao/existe');
  assert.strictEqual(unknown.error.code, -32601);
});
