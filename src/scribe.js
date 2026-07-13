const fs = require('fs');
const path = require('path');
const config = require('./config');

function logAction(actionName, details) {
  const timestamp = new Date().toISOString();
  const dateStr = timestamp.split('T')[0];
  const logFile = path.join(config.knowledgePath, `_NEURAL_LOG_${dateStr}.md`);
  
  const entry = `\n## 🕒 ${timestamp} - ${actionName}
- **Status:** Sucesso
- **Detalhes:** ${JSON.stringify(details)}
- **Agente:** Antigravity Symbiosis
`;

  try {
    if (!fs.existsSync(logFile)) {
      const header = `# 🧠 Diário de Bordo: Symbiosis (${dateStr})\n> Registro automatizado das interações entre a IDE e o Agente.\n`;
      fs.writeFileSync(logFile, header + entry, 'utf8');
    } else {
      fs.appendFileSync(logFile, entry, 'utf8');
    }
  } catch (err) {
    console.error(`Falha ao registrar no scribe: ${err.message}`);
  }
}

module.exports = {
  logAction
};
