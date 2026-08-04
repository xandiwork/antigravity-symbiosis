# Antigravity Symbiosis (IDE-Agent Bridge)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![MCP Protocol](https://img.shields.io/badge/Protocol-MCP-orange.svg)](https://modelcontextprotocol.io)

*🇺🇸 [Read in English](README_en.md) | 🇧🇷 [Ler em Português](README.md)*

O **Symbiosis** é a ponte definitiva entre a sua IDE (o ambiente que você manipula, como Cursor ou VSCode) e o Agente Antigravity (a Inteligência Artificial autônoma).

## Por que foi criado? (O Problema)

Atualmente, trabalhar com IA generativa para código exige uma constante "dança" de copiar e colar. Você precisa explicar o contexto do seu projeto para o chat, colar os arquivos relevantes, receber a resposta, colar de volta na IDE e testar. Esse processo é tedioso, fragmentado e extremamente suscetível a erros de versão e sobreposição (dirty writes).

O **Symbiosis** elimina esse isolamento. Ele transforma o Antigravity de um "chat externo" em um co-piloto nativo que respira o mesmo ar e enxerga a mesma tela que o desenvolvedor, criando um loop de feedback autônomo e perfeito.

## Principais Benefícios e Dores Resolvidas

- **Fim do Copia e Cola:** O Agente Antigravity lê e edita os arquivos diretamente na sua IDE via MCP, respeitando as marcações (locks) para nunca corromper arquivos que você está editando manualmente.
- **Contexto Sempre Atualizado (Watcher):** Se você modifica um código, o Agente é notificado proativamente. Ele entende o que você está fazendo em tempo real, sem que você precise digitar um comando no chat.
- **Auditoria Automática (Scribe):** Cada passo autônomo, arquivo alterado ou comando de terminal executado pelo Agente é auditado e documentado silenciosamente no seu Obsidian. Você tem um log neural perfeito de *tudo* que a IA fez na sua ausência.
- **Execução Segura:** Comandos de terminal rodam estritamente dentro de uma whitelist aprovada, garantindo que a IA não faça alterações perigosas na infraestrutura local sem supervisão.

## Para quem é?

Este projeto é ideal para:
- **Engenheiros de IA e Desenvolvedores** que usam agentes autônomos locais (como Antigravity) e querem integrá-los de forma profunda ao seu fluxo de trabalho, sem depender exclusivamente do chat da IDE.
- **Entusiastas de Produtividade (PKM)** que usam o Obsidian e querem manter um histórico documentado de todas as decisões arquiteturais e códigos gerados pela IA automaticamente na sua base de conhecimento.
- **Desenvolvedores** que sofrem com a perda de contexto ou "alucinações" das IAs devido a arquivos dessincronizados entre o que o humano editou e o que o agente acha que está no disco.

## Arquitetura e Módulos

O sistema é dividido em três pilares principais que operam em harmonia:

1. **MCP Server (`src/mcp-server.js`)**
   - O coração do Symbiosis. É através deste servidor que o Agente Antigravity se conecta à sua IDE utilizando o Model Context Protocol (MCP).
   - Fornece ferramentas robustas para leitura profunda de arquivos (token-aware), execução estrita e segura de comandos de terminal, e edição precisa de blocos de código.

2. **Watcher (`src/watcher.js`)**
   - O olho atento. Observa eventos do sistema de arquivos e da própria IDE.
   - Dispara notificações proativas para o agente quando um arquivo é salvo ou modificado pelo desenvolvedor humano, permitindo que a IA reaja imediatamente (via MCP Notifications).

3. **Scribe (`src/scribe.js`)**
   - O historiador do sistema (Diário de Bordo).
   - Audita em tempo real as ações do Agente e salva tudo em formato Markdown, aderindo às diretrizes do `NeuralVault`. As anotações são salvas diretamente no Obsidian para memória persistente de longo prazo.

## Requisitos
- Node.js (v18+)
- Uma IDE compatível com Model Context Protocol (MCP) (Cursor, VSCode com extensões, etc).
- Obsidian (para a base de conhecimento do Scribe).

## Instalação e Configuração

1. Clone o repositório.
2. Copie o arquivo de exemplo de ambiente:
   ```bash
   cp .env.example .env
   ```
3. Configure a variável `SYMBIOSIS_KNOWLEDGE_PATH` no arquivo `.env` com o caminho absoluto do seu cofre do Obsidian.
4. No arquivo de configuração do MCP da sua IDE (ex: Cursor), adicione o servidor apontando para o script principal:
   ```json
   {
     "mcpServers": {
       "antigravity-symbiosis": {
         "command": "node",
         "args": ["caminho/para/antigravity-symbiosis/src/mcp-server.js"]
       }
     }
   }
   ```
5. **Integração Nativa com o Agente Antigravity:** 
   Para que o próprio agente Antigravity utilize as ferramentas automaticamente nos seus projetos, crie um arquivo `mcp_config.json` dentro da pasta `.agents/` na raiz do seu workspace atual (ex: `D:/Pessoal/.agents/mcp_config.json`) com o seguinte conteúdo:
   ```json
   {
     "mcpServers": {
       "symbiosis": {
         "command": "node",
         "args": ["D:/Trabalho/ANTIGRAVITY/antigravity-symbiosis/src/mcp-server.js"],
         "env": {
           "SYMBIOSIS_KNOWLEDGE_PATH": "Caminho/do/seu/Obsidian"
         }
       }
     }
   }
   ```

## Inicialização

Para iniciar manualmente e testar as saídas de log:
```bash
npm start
```
O servidor começará a escutar requisições JSON-RPC via stdio e o Scribe iniciará o monitoramento da base de conhecimento.

---
*Desenvolvido e mantido sob a infraestrutura do Antigravity / NeuralVault.*
