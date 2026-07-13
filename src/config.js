const path = require('path');
const fs = require('fs');

const config = {
  knowledgePath: process.env.SYMBIOSIS_KNOWLEDGE_PATH || path.join('D:', 'Trabalho', 'ANTIGRAVITY', 'knowledge'),
  commandWhitelist: ['git status', 'git diff', 'dir', 'ls'],
  lockString: '// NEURAL_LOCK'
};

// Assegura que o diretório de log exista
if (!fs.existsSync(config.knowledgePath)) {
  fs.mkdirSync(config.knowledgePath, { recursive: true });
}

module.exports = config;
