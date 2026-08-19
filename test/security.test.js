const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { resolveInWorkspace, readFile, editFile } = require('../src/workspace');
const { parseCommand, runCommand } = require('../src/commands');

const LOCK = '// NEURAL_LOCK';
const MAX = 1024;

function makeWorkspace() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'symbiosis-')));
  const root = path.join(base, 'workspace');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'console.log("ola");\n');
  fs.writeFileSync(path.join(root, '.env'), 'TOKEN=ficticio\n');
  fs.writeFileSync(path.join(root, '.git', 'config'), '[core]\n');
  fs.writeFileSync(path.join(base, 'fora.txt'), 'fora do workspace\n');
  return { base, root };
}

const allowlist = require('../src/config').commandAllowlist;

test('edit_file: bloqueia travessia de caminho (../)', () => {
  const { root } = makeWorkspace();
  assert.throws(() => editFile(root, '../fora.txt', 'x', { lockString: LOCK, maxBytes: MAX }), /outside workspace/);
  assert.throws(() => editFile(root, 'src/../../fora.txt', 'x', { lockString: LOCK, maxBytes: MAX }), /outside workspace/);
  // Caminho inexistente: só a checagem de prefixo protege (não há realpath para seguir).
  assert.throws(() => resolveInWorkspace(root, '../nao-existe.txt'), /Path outside workspace/);
  assert.throws(() => resolveInWorkspace(root, '../workspace-irmao/x'), /Path outside workspace/);
});

test('edit_file: bloqueia caminho absoluto fora da raiz', () => {
  const { base, root } = makeWorkspace();
  assert.throws(() => editFile(root, path.join(base, 'fora.txt'), 'x', { lockString: LOCK, maxBytes: MAX }), /outside workspace/);
  assert.strictEqual(fs.readFileSync(path.join(base, 'fora.txt'), 'utf8'), 'fora do workspace\n');
});

test('edit_file: bloqueia link simbólico que sai da raiz', { skip: process.platform === 'win32' }, () => {
  const { base, root } = makeWorkspace();
  fs.symlinkSync(path.join(base, 'fora.txt'), path.join(root, 'atalho.txt'));
  assert.throws(() => editFile(root, 'atalho.txt', 'x', { lockString: LOCK, maxBytes: MAX }), /resolves outside workspace/);
  assert.strictEqual(fs.readFileSync(path.join(base, 'fora.txt'), 'utf8'), 'fora do workspace\n');
});

test('edit_file/read_file: bloqueia .env e .git/', () => {
  const { root } = makeWorkspace();
  assert.throws(() => editFile(root, '.env', 'x', { lockString: LOCK, maxBytes: MAX }), /secret files/);
  assert.throws(() => readFile(root, '.env', { maxBytes: MAX }), /secret files/);
  assert.throws(() => editFile(root, '.git/config', 'x', { lockString: LOCK, maxBytes: MAX }), /not allowed/);
  assert.doesNotThrow(() => resolveInWorkspace(root, '.env.example'));
});

test('edit_file: respeita a trava NEURAL_LOCK', () => {
  const { root } = makeWorkspace();
  const file = path.join(root, 'src', 'app.js');
  fs.writeFileSync(file, `${LOCK}\nconst x = 1;\n`);
  assert.throws(() => editFile(root, 'src/app.js', 'y', { lockString: LOCK, maxBytes: MAX }), /locked/);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), `${LOCK}\nconst x = 1;\n`);
});

test('edit_file: aborta se a trava aparecer durante a edição', () => {
  const { root } = makeWorkspace();
  const file = path.join(root, 'src', 'app.js');
  assert.throws(() => editFile(root, 'src/app.js', 'novo', {
    lockString: LOCK,
    maxBytes: MAX,
    beforeCommit: () => fs.writeFileSync(file, `${LOCK}\nedição humana\n`)
  }), /locked during the edit/);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), `${LOCK}\nedição humana\n`);
  assert.deepStrictEqual(fs.readdirSync(path.join(root, 'src')), ['app.js'], 'Temporário removido');
});

test('edit_file: aborta se o arquivo mudar durante a edição', () => {
  const { root } = makeWorkspace();
  const file = path.join(root, 'src', 'app.js');
  assert.throws(() => editFile(root, 'src/app.js', 'novo', {
    lockString: LOCK,
    maxBytes: MAX,
    beforeCommit: () => fs.writeFileSync(file, 'edição humana\n')
  }), /changed on disk/);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'edição humana\n');
});

test('edit_file: limita tamanho e grava de forma atômica', () => {
  const { root } = makeWorkspace();
  assert.throws(() => editFile(root, 'src/app.js', 'x'.repeat(MAX + 1), { lockString: LOCK, maxBytes: MAX }), /too large/);
  const res = editFile(root, 'src/app.js', 'console.log("tchau");\n', { lockString: LOCK, maxBytes: MAX });
  assert.strictEqual(res.path, path.join('src', 'app.js'));
  assert.strictEqual(fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8'), 'console.log("tchau");\n');
  assert.deepStrictEqual(fs.readdirSync(path.join(root, 'src')), ['app.js']);
});

test('edit_file: não cria arquivos novos', () => {
  const { root } = makeWorkspace();
  assert.throws(() => editFile(root, 'src/novo.js', 'x', { lockString: LOCK, maxBytes: MAX }), /not found/);
});

test('run_command: bloqueia injeção por quebra de linha', () => {
  const { root } = makeWorkspace();
  for (const cmd of ['git status\ntouch pwned', 'git status\rtouch pwned', 'ls\n', 'git status\ttouch']) {
    assert.throws(() => parseCommand(cmd, allowlist, root), /Control or shell/, JSON.stringify(cmd));
  }
});

test('run_command: bloqueia metacaracteres de shell', () => {
  const { root } = makeWorkspace();
  for (const cmd of ['ls; rm -rf x', 'ls && id', 'ls | sh', 'ls $(id)', 'ls `id`', 'ls > x', "ls 'a b'"]) {
    assert.throws(() => parseCommand(cmd, allowlist, root), /Control or shell/, cmd);
  }
});

test('run_command: allowlist exata (lsof não passa por ls)', () => {
  const { root } = makeWorkspace();
  assert.throws(() => parseCommand('lsof', allowlist, root), /Not in allowlist/);
  assert.throws(() => parseCommand('git statusx', allowlist, root), /Not in allowlist/);
  assert.throws(() => parseCommand('git push', allowlist, root), /Not in allowlist/);
  assert.throws(() => parseCommand('dir', allowlist, root), /Not in allowlist/);
});

test('run_command: bloqueia opções e caminhos fora da allowlist', () => {
  const { root } = makeWorkspace();
  assert.throws(() => parseCommand('git diff --output=/tmp/x', allowlist, root), /Option not allowed/);
  assert.throws(() => parseCommand('git status origin', allowlist, root), /Unexpected argument/);
  assert.throws(() => parseCommand('ls ../', allowlist, root), /outside workspace/);
  assert.throws(() => parseCommand('ls /etc', allowlist, root), /outside workspace/);
  assert.deepStrictEqual(parseCommand('ls -la src', allowlist, root), { file: 'ls', args: ['-la', 'src'] });
  assert.deepStrictEqual(
    parseCommand('git diff --stat', allowlist, root).args,
    ['--no-pager', '-c', 'core.fsmonitor=false', 'diff', '--no-ext-diff', '--no-textconv', '--no-color', '--stat']
  );
});

test('run_command: cwd confinado ao workspace', async () => {
  const { root } = makeWorkspace();
  const opts = { root, allowlist, timeoutMs: 5000, maxOutputBytes: 64 * 1024 };
  await assert.rejects(runCommand('ls', { ...opts, cwd: '..' }), /outside workspace/);
  await assert.rejects(runCommand('ls', { ...opts, cwd: '/' }), /outside workspace/);
});

test('run_command: executa comando permitido sem shell', { skip: process.platform === 'win32' }, async () => {
  const { root } = makeWorkspace();
  fs.rmSync(path.join(root, '.git'), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: root });
  const opts = { root, allowlist, timeoutMs: 5000, maxOutputBytes: 64 * 1024 };

  const ls = await runCommand('ls src', opts);
  assert.strictEqual(ls.exitCode, 0);
  assert.match(ls.stdout, /app\.js/);

  const status = await runCommand('git status --short', opts);
  assert.strictEqual(status.exitCode, 0);
  assert.match(status.stdout, /src\//);

  const inSubdir = await runCommand('ls', { ...opts, cwd: 'src' });
  assert.strictEqual(inSubdir.cwd, 'src');
  assert.strictEqual(inSubdir.stdout.trim(), 'app.js');
});
