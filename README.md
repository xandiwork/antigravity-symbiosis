# Antigravity Symbiosis (IDE-Agent Bridge)

O **Symbiosis** é a ponte definitiva entre a sua IDE (o ambiente que você manipula, como Cursor ou VSCode) e o Agente Antigravity (a Inteligência Artificial autônoma).

## Por que foi criado?

A ideia inicial era unificar o contexto e criar um loop de feedback perfeito: o Agente atua como a mente autônoma, usando a própria IDE como sua "ferramenta" estendida. O Agente visualiza seu editor, atua em arquivos de código sem gerar conflitos e documenta os passos automaticamente na sua base de conhecimento (Obsidian/Pendrive).
Dessa forma, o Antigravity deixa de ser um "chat isolado" e passa a ser um co-piloto que respira o mesmo ar e vê a mesma tela que o desenvolvedor.

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

## Inicialização

Para iniciar manualmente e testar as saídas de log:
```bash
npm start
```
O servidor começará a escutar requisições JSON-RPC via stdio e o Scribe iniciará o monitoramento da base de conhecimento.

---
*Desenvolvido e mantido sob a infraestrutura do Antigravity / NeuralVault.*
