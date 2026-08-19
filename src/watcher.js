const fs = require('fs');
const path = require('path');

const TEMP_FILE = /\.symbiosis-[0-9a-f]+\.tmp$/;

/**
 * Observa o workspace e entrega as mudanças em lotes (debounce).
 * Ignora .git, node_modules, a pasta de logs do Scribe e os temporários de escrita atômica.
 *
 * onChanges recebe [{ path, type, at }], com caminhos relativos à raiz.
 * Retorna { close, recursive } — `recursive` é false quando a plataforma não
 * suporta fs.watch recursivo (ex.: Linux com Node < 20); aí só a raiz é observada.
 */
function createWatcher(root, { onChanges, debounceMs = 500, ignoredSegments = ['.git', 'node_modules'], ignoredPaths = [] }) {
  const pending = new Map();
  let timer = null;

  const ignoredAbs = ignoredPaths.map(p => path.resolve(p));

  function isIgnored(relative) {
    if (!relative || relative.startsWith('..')) return true;
    if (relative.split(/[\\/]/).some(s => ignoredSegments.includes(s))) return true;
    if (TEMP_FILE.test(relative)) return true;
    const abs = path.resolve(root, relative);
    return ignoredAbs.some(p => abs === p || abs.startsWith(p + path.sep));
  }

  function flush() {
    timer = null;
    const changes = [...pending.values()];
    pending.clear();
    if (changes.length) onChanges(changes);
  }

  function handle(eventType, filename) {
    if (!filename) return;
    const relative = path.normalize(filename.toString());
    if (isIgnored(relative)) return;
    const type = eventType === 'rename'
      ? (fs.existsSync(path.join(root, relative)) ? 'created' : 'deleted')
      : 'modified';
    pending.set(relative, { path: relative.split(path.sep).join('/'), type, at: new Date().toISOString() });
    clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  }

  let watcher;
  let recursive = true;
  try {
    watcher = fs.watch(root, { recursive: true }, handle);
  } catch (err) {
    recursive = false;
    watcher = fs.watch(root, handle);
  }
  watcher.on('error', err => process.stderr.write(`[watcher] ${err.message}\n`));

  return {
    recursive,
    close() {
      clearTimeout(timer);
      watcher.close();
    }
  };
}

// Modo standalone: imprime as mudanças no terminal (útil para depurar sem cliente MCP).
if (require.main === module) {
  const targetDir = path.resolve(process.argv[2] || process.cwd());
  const w = createWatcher(targetDir, {
    onChanges: changes => changes.forEach(c => console.log(`[${c.at}] ${c.type}: ${c.path}`))
  });
  console.log(`📡 Symbiosis Watcher em: ${targetDir}${w.recursive ? '' : ' (somente raiz: fs.watch recursivo indisponível)'}`);
}

module.exports = { createWatcher };
