const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const config = require('./config');
const scribe = require('./scribe');

// Utils
function sendResponse(id, result, isError = false) {
  const msg = {
    jsonrpc: "2.0",
    id,
  };
  if (isError) {
    msg.error = { code: -32000, message: result };
  } else {
    msg.result = result;
  }
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function sendNotification(method, params) {
  const msg = {
    jsonrpc: "2.0",
    method,
    params
  };
  process.stdout.write(JSON.stringify(msg) + "\n");
}

// Handlers
async function handleGetContext(args) {
  const workspacePath = args.workspace || process.cwd();
  
  // Em uma implementação real completa, a IDE passaria o estado real via uma variável de ambiente, 
  // ou leria de um arquivo local sincronizado. Aqui vamos ler o diretório como proxy do estado.
  const files = fs.readdirSync(workspacePath).slice(0, 15);
  
  const context = {
    workspace: workspacePath,
    recentFiles: files,
    summary: "Simulated IDE state retrieved successfully."
  };
  
  scribe.logAction('symbiosis_get_context', { workspace: workspacePath });
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify(context, null, 2)
    }]
  };
}

async function handleEditFile(args) {
  const targetPath = args.path;
  const content = args.content;
  
  if (!fs.existsSync(targetPath)) {
    throw new Error(`File not found: ${targetPath}`);
  }
  
  const currentContent = fs.readFileSync(targetPath, 'utf8');
  if (currentContent.includes(config.lockString)) {
    throw new Error(`File is locked by IDE (${config.lockString} found). Aborting edit to prevent dirty write.`);
  }
  
  // Realiza edição simplificada (na prática, o MCP server seria mais esperto para replaces cirúrgicos)
  fs.writeFileSync(targetPath, content, 'utf8');
  
  scribe.logAction('symbiosis_edit_file', { path: targetPath, contentLength: content.length });
  
  return {
    content: [{
      type: "text",
      text: `File ${targetPath} successfully updated.`
    }]
  };
}

async function handleRunCommand(args) {
  const cmd = args.command;
  
  if (!config.commandWhitelist.some(allowed => cmd.startsWith(allowed))) {
    throw new Error(`Command blocked. Not in whitelist. Allowed commands: ${config.commandWhitelist.join(', ')}`);
  }
  
  return new Promise((resolve) => {
    exec(cmd, { cwd: args.cwd || process.cwd() }, (error, stdout, stderr) => {
      scribe.logAction('symbiosis_run_command', { command: cmd, success: !error });
      
      resolve({
        content: [{
          type: "text",
          text: `Output:\n${stdout}\n\nErrors:\n${stderr}`
        }]
      });
    });
  });
}

// MCP Router
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  if (!line.trim()) return;
  
  try {
    const msg = JSON.parse(line);
    if (!msg.id) {
      if (msg.method === "notifications/initialized") {
        scribe.logAction('symbiosis_initialized', {});
      }
      return;
    }

    if (msg.method === "initialize") {
      sendResponse(msg.id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "antigravity-symbiosis", version: "1.0.0" }
      });
    } else if (msg.method === "tools/list") {
      sendResponse(msg.id, {
        tools: [
          {
            name: "symbiosis_get_context",
            description: "Captura um raio-x do ambiente (arquivos e contexto atual da IDE).",
            inputSchema: {
              type: "object",
              properties: {
                workspace: { type: "string" }
              }
            }
          },
          {
            name: "symbiosis_edit_file",
            description: "Edita um arquivo respeitando a trava neural_lock.",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string" },
                content: { type: "string" }
              },
              required: ["path", "content"]
            }
          },
          {
            name: "symbiosis_run_command",
            description: "Executa um comando de terminal dentro da whitelist configurada.",
            inputSchema: {
              type: "object",
              properties: {
                command: { type: "string" },
                cwd: { type: "string" }
              },
              required: ["command"]
            }
          }
        ]
      });
    } else if (msg.method === "tools/call") {
      const toolName = msg.params.name;
      const args = msg.params.arguments || {};
      
      try {
        let result;
        if (toolName === "symbiosis_get_context") {
          result = await handleGetContext(args);
        } else if (toolName === "symbiosis_edit_file") {
          result = await handleEditFile(args);
        } else if (toolName === "symbiosis_run_command") {
          result = await handleRunCommand(args);
        } else {
          throw new Error(`Tool not found: ${toolName}`);
        }
        sendResponse(msg.id, result);
      } catch (err) {
        sendResponse(msg.id, err.message, true);
      }
    } else {
      sendResponse(msg.id, "Method not supported", true);
    }
  } catch (err) {
    // Falha de parser ou erro crítico
  }
});
