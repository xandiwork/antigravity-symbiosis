const readline = require('readline');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const scribe = require('./scribe');
const workspace = require('./workspace');
const { runCommand } = require('./commands');
const { createWatcher } = require('./watcher');

const PROTOCOL_VERSION = '2024-11-05';
const AGENT_WRITE_WINDOW_MS = 3000;

const TOOLS = [
  {
    name: 'symbiosis_get_context',
    description: 'Retorna o estado do workspace: arquivos de uma pasta e as mudanças recentes detectadas pelo watcher (com origem agente/externa).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Pasta relativa à raiz do workspace (padrão: raiz).' }
      }
    }
  },
  {
    name: 'symbiosis_read_file',
    description: 'Lê um arquivo de texto dentro do workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Caminho relativo à raiz do workspace.' }
      },
      required: ['path']
    }
  },
  {
    name: 'symbiosis_edit_file',
    description: 'Substitui o conteúdo de um arquivo existente do workspace (gravação atômica), respeitando a trava NEURAL_LOCK.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Caminho relativo à raiz do workspace.' },
        content: { type: 'string' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'symbiosis_run_command',
    description: 'Executa, sem shell, um comando da allowlist (git status, git diff, ls) dentro do workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        cwd: { type: 'string', description: 'Pasta relativa à raiz do workspace (padrão: raiz).' }
      },
      required: ['command']
    }
  }
];

function text(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

function createServer({ cfg = config, write = line => process.stdout.write(line + '\n'), log = scribe.logAction } = {}) {
  const root = cfg.workspaceRoot;
  const recentChanges = [];
  const agentWrites = new Map();
  let initialized = false;
  let watcher = null;

  function send(msg) {
    write(JSON.stringify({ jsonrpc: '2.0', ...msg }));
  }

  function onChanges(changes) {
    const now = Date.now();
    const tagged = changes.map(c => {
      const wroteAt = agentWrites.get(c.path);
      return { ...c, origin: wroteAt && now - wroteAt < AGENT_WRITE_WINDOW_MS ? 'agent' : 'external' };
    });
    recentChanges.push(...tagged);
    recentChanges.splice(0, Math.max(0, recentChanges.length - cfg.watcherHistorySize));

    const external = tagged.filter(c => c.origin === 'external');
    if (external.length === 0) return;
    log('ide_file_change', { changes: external.map(c => `${c.type}:${c.path}`) });
    if (initialized) {
      send({
        method: 'notifications/message',
        params: { level: 'info', logger: 'symbiosis-watcher', data: { event: 'files_changed', changes: external } }
      });
    }
  }

  function startWatcher() {
    if (watcher) return;
    try {
      watcher = createWatcher(root, {
        onChanges,
        debounceMs: cfg.watcherDebounceMs,
        ignoredSegments: cfg.ignoredSegments,
        ignoredPaths: [cfg.knowledgePath]
      });
    } catch (err) {
      process.stderr.write(`[symbiosis] watcher unavailable: ${err.message}\n`);
    }
  }

  const handlers = {
    symbiosis_get_context(args) {
      const dir = args.path ? workspace.resolveInWorkspace(root, args.path, { allowRoot: true }) : root;
      const entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => !cfg.ignoredSegments.includes(e.name))
        .slice(0, 100)
        .map(e => (e.isDirectory() ? `${e.name}/` : e.name));
      log('symbiosis_get_context', { path: path.relative(root, dir) || '.' });
      return text({
        workspace: root,
        path: path.relative(root, dir) || '.',
        entries,
        recentChanges: [...recentChanges].reverse(),
        watcher: watcher ? (watcher.recursive ? 'recursive' : 'root-only') : 'off'
      });
    },

    symbiosis_read_file(args) {
      const file = workspace.readFile(root, args.path, { maxBytes: cfg.maxFileBytes });
      log('symbiosis_read_file', { path: file.path });
      return text(file.content);
    },

    symbiosis_edit_file(args) {
      const result = workspace.editFile(root, args.path, args.content, {
        lockString: cfg.lockString,
        maxBytes: cfg.maxFileBytes
      });
      agentWrites.set(result.path.split(path.sep).join('/'), Date.now());
      log('symbiosis_edit_file', { path: result.path, contentLength: result.bytes });
      return text(`File ${result.path} successfully updated.`);
    },

    async symbiosis_run_command(args) {
      const result = await runCommand(args.command, {
        cwd: args.cwd,
        root,
        allowlist: cfg.commandAllowlist,
        timeoutMs: cfg.commandTimeoutMs,
        maxOutputBytes: cfg.commandMaxOutputBytes
      });
      log('symbiosis_run_command', { command: args.command, exitCode: result.exitCode });
      const out = text(`Exit code: ${result.exitCode}\n\nOutput:\n${result.stdout}\n\nErrors:\n${result.stderr}`);
      if (result.exitCode !== 0) out.isError = true;
      return out;
    }
  };

  async function handleMessage(msg) {
    if (msg.id === undefined || msg.id === null) {
      if (msg.method === 'notifications/initialized') {
        initialized = true;
        log('symbiosis_initialized', {});
      }
      return;
    }

    switch (msg.method) {
      case 'initialize':
        startWatcher();
        return send({
          id: msg.id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {}, logging: {} },
            serverInfo: { name: 'antigravity-symbiosis', version: '1.0.0' }
          }
        });
      case 'ping':
      case 'logging/setLevel':
        return send({ id: msg.id, result: {} });
      case 'tools/list':
        return send({ id: msg.id, result: { tools: TOOLS } });
      case 'tools/call': {
        const { name, arguments: args = {} } = msg.params || {};
        const handler = handlers[name];
        if (!handler) {
          return send({ id: msg.id, error: { code: -32602, message: `Tool not found: ${name}` } });
        }
        try {
          return send({ id: msg.id, result: await handler(args) });
        } catch (err) {
          return send({ id: msg.id, result: { ...text(err.message), isError: true } });
        }
      }
      default:
        return send({ id: msg.id, error: { code: -32601, message: `Method not supported: ${msg.method}` } });
    }
  }

  async function handleLine(line) {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (err) {
      return send({ id: null, error: { code: -32700, message: 'Parse error' } });
    }
    await handleMessage(msg);
  }

  return {
    handleLine,
    close() {
      if (watcher) watcher.close();
    }
  };
}

if (require.main === module) {
  const server = createServer();
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', line => {
    server.handleLine(line).catch(err => process.stderr.write(`[symbiosis] ${err.stack}\n`));
  });
  rl.on('close', () => {
    server.close();
  });
}

module.exports = { createServer, TOOLS };
