const path = require('path');
const fs = require('fs');

// Raiz do workspace: todas as leituras, edições e comandos ficam confinados a ela.
const workspaceRoot = fs.realpathSync(path.resolve(process.env.SYMBIOSIS_WORKSPACE || process.cwd()));

const config = {
  workspaceRoot,
  knowledgePath: path.resolve(process.env.SYMBIOSIS_KNOWLEDGE_PATH || path.join(process.cwd(), 'knowledge')),
  lockString: '// NEURAL_LOCK',

  // Limites de leitura/escrita
  maxFileBytes: 1024 * 1024,

  // Comandos permitidos: correspondência exata do executável e dos argumentos fixos.
  // `flags` lista as opções extras aceitas; `paths` permite caminhos (confinados ao workspace).
  commandAllowlist: [
    { command: 'git', args: ['status'], flags: ['--short', '-s', '--branch', '-b', '--porcelain'], paths: false },
    { command: 'git', args: ['diff'], flags: ['--stat', '--name-only', '--name-status', '--cached', '--staged', '--'], paths: true },
    { command: 'ls', args: [], flags: ['-l', '-a', '-la', '-al', '-1'], paths: true }
  ],
  commandTimeoutMs: 10000,
  commandMaxOutputBytes: 256 * 1024,

  // Watcher
  watcherDebounceMs: 500,
  watcherHistorySize: 50,
  ignoredSegments: ['.git', 'node_modules']
};

// Assegura que o diretório de log exista
if (!fs.existsSync(config.knowledgePath)) {
  fs.mkdirSync(config.knowledgePath, { recursive: true });
}

module.exports = config;
