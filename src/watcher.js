const fs = require('fs');
const path = require('path');
const config = require('./config');
const scribe = require('./scribe');

function startWatcher(workspacePath) {
  if (!fs.existsSync(workspacePath)) {
    console.error(`Watcher: Workspace não encontrado -> ${workspacePath}`);
    return;
  }
  
  console.log(`📡 Symbiosis Watcher iniciado em: ${workspacePath}`);
  
  let debounceTimer;
  fs.watch(workspacePath, { recursive: true }, (eventType, filename) => {
    // Ignora a própria pasta de knowledge/logs e .git para evitar loops infinitos
    if (!filename || filename.includes('knowledge') || filename.includes('.git')) return;
    
    // Debounce simples para evitar múltiplos eventos no mesmo save
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      // IDE envia um alerta ao Agente
      // Na prática o watcher acionaria o MCP (notifications/message), mas como processo standalone
      // vamos apenas logar via scribe e, idealmente, cuspir para a saída padrão.
      const msg = `Arquivo modificado: ${filename} (Tipo: ${eventType})`;
      console.log(`[IDE NOTIFY]: ${msg}`);
      
      scribe.logAction('ide_file_change', { file: filename, type: eventType });
      
    }, 1500); // Aguarda 1.5s após a última alteração (gatilho inteligente)
  });
}

// Se rodado diretamente
if (require.main === module) {
  const targetDir = process.argv[2] || process.cwd();
  startWatcher(targetDir);
}

module.exports = { startWatcher };
