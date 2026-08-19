# Antigravity Symbiosis (IDE-Agent Bridge)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![MCP Protocol](https://img.shields.io/badge/Protocol-MCP-orange.svg)](https://modelcontextprotocol.io)

*🇺🇸 [Read in English](README_en.md) | 🇧🇷 [Ler em Português](README.md)*

O **Symbiosis** é a ponte definitiva entre a sua IDE (o ambiente que você manipula, como Cursor ou VSCode) e o Agente Antigravity (a Inteligência Artificial autônoma).

## Por que foi criado? (A História e o Problema)

No passado, assistentes de IA (como a versão original do Antigravity) eram nativamente acoplados e integrados às IDEs. No entanto, com a evolução da tecnologia, o Google e outras gigantes decidiram separar os agentes, transformando-os em processos autônomos que rodam fora da IDE para ganhar mais poder computacional e liberdade de arquitetura.

Embora o Agente tenha ficado mais inteligente, nós, desenvolvedores, perdemos a comodidade. Trabalhar com IA generativa para código voltou a exigir uma constante "dança" de copiar e colar: você precisa explicar o contexto do seu projeto para um chat externo, colar os arquivos relevantes, receber a resposta, colar de volta na IDE e testar. Esse processo se tornou tedioso, fragmentado e extremamente suscetível a erros de versão e sobreposição (dirty writes).

O **Symbiosis** nasceu exatamente dessa dor. Ele elimina esse isolamento reconectando as pontes. Ele transforma o Antigravity moderno (ou qualquer agente) novamente em um co-piloto nativo que respira o mesmo ar e enxerga a mesma tela que o desenvolvedor, criando um loop de feedback autônomo e perfeito, mas sem abrir mão da sua inteligência desacoplada.

## Principais Benefícios e Dores Resolvidas

- **Fim do Copia e Cola:** O agente lê e edita os arquivos do workspace via MCP, respeitando a trava `// NEURAL_LOCK` e abortando a gravação se o arquivo mudar no meio da edição.
- **Contexto Sempre Atualizado (Watcher):** Quando você salva um arquivo, o servidor envia uma notificação MCP ao agente e registra a mudança no contexto, separando o que foi editado por você do que foi editado pelo próprio agente.
- **Auditoria Automática (Scribe):** Cada passo autônomo, arquivo alterado ou comando de terminal executado pelo Agente é auditado e documentado silenciosamente no seu Obsidian. Você tem um log neural perfeito de *tudo* que a IA fez na sua ausência.
- **Execução Segura:** Comandos rodam sem shell, só se baterem exatamente com a allowlist (`git status`, `git diff`, `ls` e opções pré-aprovadas), com tempo limite e sempre dentro do workspace.

## Para quem é?

Este projeto é ideal para:
- **Engenheiros de IA e Desenvolvedores** que usam agentes autônomos locais (como Antigravity) e querem integrá-los de forma profunda ao seu fluxo de trabalho, sem depender exclusivamente do chat da IDE.
- **Entusiastas de Produtividade (PKM)** que usam o Obsidian e querem manter um histórico documentado de todas as decisões arquiteturais e códigos gerados pela IA automaticamente na sua base de conhecimento.
- **Desenvolvedores** que sofrem com a perda de contexto ou "alucinações" das IAs devido a arquivos dessincronizados entre o que o humano editou e o que o agente acha que está no disco.

## Arquitetura e Módulos

O sistema é dividido em três pilares principais que operam em harmonia:

1. **MCP Server (`src/mcp-server.js`)**
   - O coração do Symbiosis. É através deste servidor que o Agente Antigravity se conecta à sua IDE utilizando o Model Context Protocol (MCP).
   - Ferramentas expostas:

     | Ferramenta | O que faz |
     |---|---|
     | `symbiosis_get_context` | Lista uma pasta do workspace e as mudanças recentes detectadas pelo watcher (origem `agent` ou `external`). |
     | `symbiosis_read_file` | Lê um arquivo de texto do workspace (limite de 1 MB). |
     | `symbiosis_edit_file` | Substitui o conteúdo de um arquivo existente com gravação atômica, respeitando a trava. |
     | `symbiosis_run_command` | Executa um comando da allowlist, sem shell, dentro do workspace. |

   - Todas as ferramentas ficam confinadas à pasta `SYMBIOSIS_WORKSPACE` (links simbólicos incluídos) e recusam `.env` e `.git/`.

2. **Watcher (`src/watcher.js`)**
   - O olho atento. Roda dentro do processo do servidor e observa o sistema de arquivos do workspace (ignorando `.git`, `node_modules` e a pasta de logs).
   - Agrupa as mudanças (debounce de 500 ms) e envia `notifications/message` ao agente quando um arquivo é criado, alterado ou removido por alguém que não o próprio agente.
   - Também pode rodar sozinho para depuração: `node src/watcher.js <pasta>`.

3. **Scribe (`src/scribe.js`)**
   - O historiador do sistema (Diário de Bordo).
   - Registra cada ação do agente e cada mudança externa em um arquivo Markdown diário (`_NEURAL_LOG_AAAA-MM-DD.md`) na pasta `SYMBIOSIS_KNOWLEDGE_PATH`, que pode ser um cofre do Obsidian.

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
3. Defina as variáveis de ambiente (o servidor não lê o `.env` sozinho; passe-as pelo bloco `env` da configuração MCP):
   - `SYMBIOSIS_WORKSPACE`: pasta do projeto que o agente pode acessar (padrão: pasta onde o servidor é iniciado).
   - `SYMBIOSIS_KNOWLEDGE_PATH`: pasta dos logs do Scribe, por exemplo o seu cofre do Obsidian.
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
   Para que o próprio agente Antigravity utilize as ferramentas automaticamente nos seus projetos, crie um arquivo `mcp_config.json` dentro da pasta `.agents/` na raiz do seu workspace atual (ex: `C:/meu-projeto/.agents/mcp_config.json`) com o seguinte conteúdo:
   ```json
   {
     "mcpServers": {
       "symbiosis": {
         "command": "node",
         "args": ["C:/caminho/para/antigravity-symbiosis/src/mcp-server.js"],
         "env": {
           "SYMBIOSIS_WORKSPACE": "C:/meu-projeto",
           "SYMBIOSIS_KNOWLEDGE_PATH": "C:/caminho/para/seu/Obsidian/knowledge"
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
O servidor escuta requisições JSON-RPC via stdio; o watcher começa a observar o workspace assim que o cliente envia `initialize`.

## Testes

```bash
npm test
```

A suíte (`node:test`, sem dependências) cobre travessia de caminho (`../`, caminho absoluto, link simbólico), `.env` e `.git/`, a trava antes e durante a gravação, injeção por quebra de linha e metacaracteres, allowlist exata (`lsof` não passa por `ls`), `cwd` fora do workspace, e um teste ponta a ponta do protocolo com notificação do watcher. O CI roda os testes no Node 18, 20 e 22, além do gitleaks.

## Limitações conhecidas

- O "contexto da IDE" vem do sistema de arquivos: o servidor não enxerga abas abertas, cursor ou buffers não salvos.
- `symbiosis_edit_file` substitui o arquivo inteiro; não há edição por trechos.
- No Linux com Node 18, `fs.watch` recursivo não existe: o watcher observa só a raiz do workspace (Node 20+ observa tudo).
- O protocolo MCP (versão `2024-11-05`) é implementado à mão, sem o SDK oficial.
- No Windows, `ls` só funciona se estiver no PATH (por exemplo, com o Git for Windows).

---
*Desenvolvido e mantido sob a infraestrutura Antigravity.*
