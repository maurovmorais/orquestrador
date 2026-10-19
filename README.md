# Orquestrador RPA — front-end + backend

Monólito modular (Node.js + Fastify + TypeScript), PostgreSQL + Prisma, Caddy. Front-end em `frontend/` (React + Vite).

## Subir (Docker)
    cp .env.example .env          # preencha POSTGRES_PASSWORD, JWT_SECRET, APP_ENCRYPTION_KEY, SEED_PASSWORD
    cd frontend && npm install && npm run build && cd ..
    docker compose up --build -d
    docker compose exec api npx tsx prisma/seed.ts     # cria o 1º usuário, o cliente e um ambiente
Acesse https://localhost (ou o DOMAIN do .env). Desenvolvimento: `cd backend && npm i && npx prisma db push && npm run dev` e `cd frontend && npm run dev` (o Vite encaminha /api para a porta 3000).

## Estado da integração front ↔ API
Etapa 1 (feita): login (e-mail e senha do seed), sessão por cookie, nome do cliente no menu e **Ambientes** pela API. Etapa 2 (feita): **Máquinas, Automações e Parâmetros** pela API. Etapa 3 (feita): **Ativos, Agendamentos, Fila e Execuções** pela API. Nada mais fica só no navegador. O que falta é o runner, o gateway e o agendador (disparo do cron). Para simular o runner enquanto ele não existe, use `DEMO_MODE=true` no `backend/.env`.

## Pacotes das automações e pastas do runner
- O robô (Python) é compilado/empacotado e enviado como **.zip** na tela Automações (no cadastro ou em "Enviar pacote"). Cada envio vira uma nova versão; é possível voltar a uma versão anterior ("Ativar esta versão").
- O servidor confere o zip (estrutura, caminhos seguros, limite de tamanho e arquivo de entrada na raiz: `main.py`, `bot.py`, `__main__.py`, `main.pyc`, `bot.pyc`, `main.exe` ou `bot.exe`), calcula o SHA-256 e guarda em `PACKAGES_DIR/<org>/<automação>/v<N>.zip` (volume `packages` no Docker).
- Uma automação fica atrelada a **uma ou mais máquinas**; a máquina só pode ser excluída sem automações atreladas.
- **Runner (a construir):** terá duas pastas, `logs/` (logs das automações) e `bot/` (pacotes carregados pelo orquestrador, ex.: `bot/<automação>/v<N>/`). Ele baixará o pacote pela rota `GET /automations/:id/versions/:vid/package` e conferirá o SHA-256.

## Alterar tabelas
Edite `backend/prisma/schema.prisma` e rode, na pasta `backend`, `npx prisma migrate dev --name descricao_da_mudanca`: o Prisma gera o SQL, aplica no banco e guarda o histórico em `prisma/migrations`. Em produção: `npx prisma migrate deploy`. Para ver os dados: `npx prisma studio`. Funciona igual com PostgreSQL no Docker ou instalado no Windows.

## Tela do front → API (todas em `/api`, cookie de sessão; telas de um Ambiente enviam o cabeçalho `x-workspace-id`)
| Tela | Rotas |
|---|---|
| Login / nome do cliente no menu | `POST /auth/login` (devolve `cliente`), `POST /auth/logout`, `GET /auth/me` |
| Ambientes + seletor do topo | `GET/POST /workspaces`, `DELETE /workspaces/:id` (409 se há máquinas ou é o último) |
| Máquinas | `GET/POST /runners`, `POST /runners/:id/pairing-key` (chave só nesta resposta), `POST /runners/:id/unpair`, `POST /runners/bulk-delete` |
| Automações | `GET/POST /automations`, `DELETE /automations/:id` |
| Parâmetros da automação | `GET/POST /automations/:id/parameters`, `PATCH …/:pid` (alterar, ativar/desativar), `POST …/bulk-delete` |
| Ativos | `GET/POST /assets`, `PATCH /assets/:id`, `POST /assets/bulk-delete` (pasta, escopo global/local) |
| Fila | `GET /automations/:id/queue-items?page&pageSize=10\|50\|100&order=recent\|oldest`, `POST /queue-items/actions` {cancel\|duplicate\|reprocess}, `POST /automations/:id/queue-items` (inserção; cada item = `{ data: {...}, reference? }`), `GET /queue-items/:id` (dados do item) |
| Execuções + logs | `GET /jobs`, `GET /jobs/:id`, `GET /jobs/:id/logs`, `POST /jobs`, `POST /jobs/:id/cancel` {graceful\|abrupt} |
| Agendamentos | `GET/POST /schedules`, `PATCH /schedules/:id`, `POST /schedules/bulk-delete` |
| Auditoria | `GET /audit` |

## Correspondência de nomes (front → API/banco)
- Tipos: string/int/float/bool = iguais; **data → `date`** (DD/MM/YYYY); **confidencial → `secret`**.
- Fila (JOB): ao iniciar a automação (manual ou agendamento) todos os itens `new` formam um JOB (`waiting`); cancelar vale para `waiting`/`in_progress` ou para o JOB inteiro (`cancel_job`). NEW=`new`, AGUARDANDO=`waiting` (iniciou com a máquina ocupada), PROCESSANDO=`in_progress`, SUCESSO=`done`, FALHA=`failed`, CANCELADO=`cancelled`. "Timestamp" = `queuedAt`.
- Execução: em execução=`pending/assigned/running`, cancelando=`cancelling`, concluída=`success`, falha=`failed`, cancelada=`cancelled`, abortada=`timeout`.
- Ambiente: Produção=`production`, Desenvolvimento=`development`. Máquina = `runner`. Execução = `job`.

## Suposições (confirme)
1. **Ambiente = `workspaces`**, tabela nova (a doc só tem `organizations`): organização = cliente do usuário; cada ambiente (ex.: "Produção: Financeiro") é isolado; as tabelas de negócio ganharam `workspaceId`.
2. **Máquina antes do runner:** o front cadastra a máquina e depois gera a chave; então `registration_tokens` aponta para um `runner` já existente (a doc cria o runner no registro).
3. **Fila por automação** (`queues.automationId`); o front não tem filas nomeadas. `queue_items` ganhou `log` e `queuedAt` (FIFO e timestamp; reprocessar reentra no fim).
4. **Ativos:** `automation_assets` (N:N) foi trocada por `folder` + `scope` (global/local) + `automationId`, como na tela. O SDK usará pasta e nome (a doc cita só `get_asset(nome)`).
5. **Parâmetros:** ganharam valor, `active` (inativo = não enviado) e tipos `date`/`secret`. A doc diz que parâmetros não são cofre; mantive o tipo confidencial da tela, **criptografado** (AES-256-GCM) e nunca devolvido pela API.
6. **Versão:** inteira (1, 2, 3…), como na doc; o front mostrava "1.0.0" e deve exibir `v1`. A automação nasce com a versão 1 sem pacote.
7. **Exclusão lógica** (`deletedAt`) de máquinas e automações, para o histórico de execuções continuar ("(excluída)").
8. Sessão por JWT em cookie httpOnly (sem tabela de sessões); 5 falhas de login bloqueiam por 15 min.
9. No Docker o banco é criado com `prisma db push`; antes da produção gere migrations (`npx prisma migrate dev --name init`).

## Ainda não feito
Upload do `.zip` com validações e rollback · gateway WebSocket e protocolo do runner (`/runner/register`, `job.assign`, `queue.*`, `asset.get`) · runner e SDK Python · tick do cron (agendador) · logs em tempo real por SSE · 2FA e RBAC · **ligar o front-end à API** (trocar `repository.ts` por chamadas `fetch`).
