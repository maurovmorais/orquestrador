# Orquestrador de Automações (front-end)

React 18 + TypeScript + Vite + React Router.

## Rodar
    npm install
    npm run dev      # http://localhost:5173  (login demo: admin / admin)
    npm run build    # gera dist/

## Estrutura (src/)
| Pasta | Responsabilidade |
|---|---|
| `config/` | Configuração e variáveis de ambiente (`MODO_DEMO`) |
| `types/` | Tipos do domínio (Machine, Run, ...) |
| `domain/` | Regras de negócio puras (ex.: quando excluir uma máquina) |
| `services/` | Acesso a dados: `repository.ts` (trocar por API) e dados de exemplo |
| `context/` | Estado global (DataProvider) |
| `components/` | Componentes reutilizáveis (Badge, DataTable, Layout, modais) |
| `pages/` | Uma página por item do menu |
| `lib/` | Utilitários (formatação, ids) |
| `styles/` | CSS global |

## Ambientes (workspaces)
Cada cliente pode ter ambientes separados (Produção e Desenvolvimento). Os dados de cada um são isolados; o seletor fica no canto superior direito e a gestão em `/ambientes`. Dados da versão anterior são migrados para o primeiro workspace.

## Modo demonstração
`.env` -> `VITE_MODO_DEMO=true|false`. Com `false` somem simulações e dados de exemplo.

## Migração (status)
Todas as telas foram portadas: Login, Painel, Máquinas, Automações, Execuções, Agendamentos e Ativos.
