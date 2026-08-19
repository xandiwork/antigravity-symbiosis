const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BLOCKED_SEGMENTS = ['.git'];

function isInside(root, target) {
  return target === root || target.startsWith(root + path.sep);
}

function isSecretFile(name) {
  return name === '.env' || (name.startsWith('.env.') && name !== '.env.example');
}

/**
 * Resolve `userPath` (relativo à raiz ou absoluto) e garante que o destino fique
 * dentro do workspace, inclusive depois de seguir links simbólicos.
 */
function resolveInWorkspace(root, userPath, { allowRoot = false } = {}) {
  if (typeof userPath !== 'string' || userPath.length === 0) {
    throw new Error('Path is required.');
  }
  if (userPath.includes('\0')) {
    throw new Error('Invalid path.');
  }

  const resolved = path.resolve(root, userPath);
  if (!isInside(root, resolved) || (!allowRoot && resolved === root)) {
    throw new Error(`Path outside workspace: ${userPath}`);
  }

  const relative = path.relative(root, resolved);
  const segments = relative.split(path.sep);
  if (segments.some(s => BLOCKED_SEGMENTS.includes(s))) {
    throw new Error(`Access to ${relative} is not allowed.`);
  }
  if (isSecretFile(path.basename(resolved))) {
    throw new Error(`Access to secret files (${path.basename(resolved)}) is not allowed.`);
  }

  // Segue links simbólicos: o alvo real também precisa estar no workspace.
  if (fs.existsSync(resolved)) {
    const real = fs.realpathSync(resolved);
    if (!isInside(root, real)) {
      throw new Error(`Path resolves outside workspace: ${userPath}`);
    }
  }

  return resolved;
}

function readFile(root, userPath, { maxBytes }) {
  const target = resolveInWorkspace(root, userPath);
  const stat = fs.statSync(target, { throwIfNoEntry: false });
  if (!stat || !stat.isFile()) {
    throw new Error(`File not found: ${userPath}`);
  }
  if (stat.size > maxBytes) {
    throw new Error(`File too large (${stat.size} bytes, limit ${maxBytes}).`);
  }
  return { path: path.relative(root, target), content: fs.readFileSync(target, 'utf8') };
}

/**
 * Substitui o conteúdo de um arquivo existente de forma atômica, respeitando a trava.
 * A trava e o conteúdo são checados antes de gravar e de novo imediatamente antes
 * do rename, para não sobrescrever uma edição humana feita no meio do caminho.
 */
function editFile(root, userPath, content, { lockString, maxBytes, beforeCommit } = {}) {
  if (typeof content !== 'string') {
    throw new Error('Content must be a string.');
  }
  if (Buffer.byteLength(content, 'utf8') > maxBytes) {
    throw new Error(`Content too large (limit ${maxBytes} bytes).`);
  }

  const target = resolveInWorkspace(root, userPath);
  const stat = fs.statSync(target, { throwIfNoEntry: false });
  if (!stat || !stat.isFile()) {
    throw new Error(`File not found: ${userPath}`);
  }

  const original = fs.readFileSync(target, 'utf8');
  if (original.includes(lockString)) {
    throw new Error(`File is locked by IDE (${lockString} found). Aborting edit to prevent dirty write.`);
  }

  const real = fs.realpathSync(target);
  const tmp = path.join(path.dirname(real), `.${path.basename(real)}.symbiosis-${crypto.randomBytes(6).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, content, { encoding: 'utf8', mode: stat.mode & 0o777, flag: 'wx' });

  try {
    if (beforeCommit) beforeCommit(target);
    const current = fs.readFileSync(real, 'utf8');
    if (current.includes(lockString)) {
      throw new Error(`File was locked during the edit (${lockString} found). Aborting.`);
    }
    if (current !== original) {
      throw new Error('File changed on disk during the edit. Aborting to prevent dirty write.');
    }
    fs.renameSync(tmp, real);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }

  return { path: path.relative(root, target), bytes: Buffer.byteLength(content, 'utf8') };
}

module.exports = { resolveInWorkspace, readFile, editFile, isInside };
