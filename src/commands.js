const path = require('path');
const { execFile } = require('child_process');
const { resolveInWorkspace } = require('./workspace');

// Qualquer caractere de controle (inclui \n, \r, \t e \0) ou metacaractere de shell.
const FORBIDDEN_CHARS = /[\x00-\x1f\x7f&|;<>$`\\'"*?(){}[\]~!#]/;

// Opções extras que o Git recebe sempre, para não acionar pager nem diff externo.
const GIT_SAFE_OPTIONS = ['--no-pager', '-c', 'core.fsmonitor=false'];
const GIT_DIFF_SAFE_OPTIONS = ['--no-ext-diff', '--no-textconv', '--no-color'];

/**
 * Valida o comando contra a allowlist e devolve { file, args } para execFile.
 * Não usa shell: o comando é quebrado em tokens por espaço e cada token é conferido.
 */
function parseCommand(commandLine, allowlist, root) {
  if (typeof commandLine !== 'string' || !commandLine.trim()) {
    throw new Error('Command is required.');
  }
  if (FORBIDDEN_CHARS.test(commandLine)) {
    throw new Error('Command blocked. Control or shell meta-characters detected.');
  }

  const tokens = commandLine.trim().split(/ +/);
  const [command, ...rest] = tokens;

  const rule = allowlist.find(r =>
    r.command === command && r.args.every((arg, i) => rest[i] === arg)
  );
  if (!rule) {
    const allowed = allowlist.map(r => [r.command, ...r.args].join(' ')).join(', ');
    throw new Error(`Command blocked. Not in allowlist. Allowed commands: ${allowed}`);
  }

  const extra = rest.slice(rule.args.length);
  for (const token of extra) {
    if (token.startsWith('-')) {
      if (!rule.flags.includes(token)) {
        throw new Error(`Command blocked. Option not allowed: ${token}`);
      }
    } else if (rule.paths) {
      resolveInWorkspace(root, token, { allowRoot: true });
    } else {
      throw new Error(`Command blocked. Unexpected argument: ${token}`);
    }
  }

  let args = [...rule.args, ...extra];
  if (command === 'git') {
    if (rule.args[0] === 'diff') {
      args = ['diff', ...GIT_DIFF_SAFE_OPTIONS, ...args.slice(1)];
    }
    args = [...GIT_SAFE_OPTIONS, ...args];
  }
  return { file: command, args };
}

async function runCommand(commandLine, { cwd, root, allowlist, timeoutMs, maxOutputBytes }) {
  const { file, args } = parseCommand(commandLine, allowlist, root);
  const workDir = cwd ? resolveInWorkspace(root, cwd, { allowRoot: true }) : root;

  return new Promise((resolve) => {
    execFile(file, args, {
      cwd: workDir,
      shell: false,
      timeout: timeoutMs,
      maxBuffer: maxOutputBytes,
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat' }
    }, (error, stdout, stderr) => {
      let exitCode = 0;
      if (error) {
        exitCode = typeof error.code === 'number' ? error.code : 1;
        if (error.killed) stderr += `\n[killed after ${timeoutMs} ms]`;
        if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') stderr += `\n[output truncated at ${maxOutputBytes} bytes]`;
        if (error.code === 'ENOENT') stderr += `\n[command not found: ${file}]`;
      }
      resolve({ exitCode, stdout: String(stdout), stderr: String(stderr), cwd: path.relative(root, workDir) || '.' });
    });
  });
}

module.exports = { parseCommand, runCommand };
