# CPX Call

Interface de chamadas de voz/vídeo para a comunidade CPX, usando Next.js, Supabase e LiveKit.

## Interface

A aplicação agora inclui:

- tela de entrada com login e convite, feedback visual e responsividade;
- workspace responsivo com canais agrupados por categoria;
- lista dinâmica de participantes e estados de microfone/câmera;
- controles de microfone, câmera, compartilhamento de tela e saída;
- indicador de estado/qualidade da conexão LiveKit;
- chat persistente por canal com pesquisa de mensagens;
- presença online, ausente e não perturbe;
- notificações/toasts com histórico local e sons configuráveis;
- busca de canais e atalhos de teclado;
- tema CPX escuro como padrão;
- perfil editável para membros;
- moderação de participantes por administradores;
- Centro de Comando com métricas, usuários, convites, canais, configurações e atividade;
- convites temporários com código protegido por hash;
- layout otimizado para desktop e celular.

PWA não faz parte desta versão.
Aplicação de chamadas de voz e vídeo para a comunidade CPX — um "Discord por dentro", construído com Next.js, Supabase e LiveKit. Suporta contas de membro/administrador com login, além de acesso temporário por código de convite para convidados.

---

## Sumário

- [Visão geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Arquitetura e stack](#arquitetura-e-stack)
- [Como o acesso funciona](#como-o-acesso-funciona)
- [Papéis e permissões](#papéis-e-permissões)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Pré-requisitos](#pré-requisitos)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Banco de dados (Supabase)](#banco-de-dados-supabase)
- [Rodando localmente](#rodando-localmente)
- [Deploy (Vercel)](#deploy-vercel)
- [Rotas da API](#rotas-da-api)
- [Segurança](#segurança)
- [Observações e manutenção](#observações-e-manutenção)

---

## Visão geral

O CPX Call é dividido em três telas principais:

- **`/`** — tela de entrada, com login (e-mail/senha) para membros e administradores, e um campo de código de convite para convidados.
- **`/servidor`** — o "workspace": lista de canais de voz/vídeo agrupados por categoria, chamada em si (câmera, microfone, compartilhamento de tela, chat), presença online e notificações.
- **`/admin`** — o Centro de Comando, visível apenas para administradores: gestão de usuários, geração e revogação de convites, criação/edição de canais e configurações globais do servidor.

## Funcionalidades

**Acesso**
- Login de membro/admin via e-mail e senha (Supabase Auth).
- Acesso de convidado por código de convite temporário, sem necessidade de conta.
- Convites com validade configurável (15 min a 7 dias), nome do convidado e revogação manual.

**Chamada**
- Vídeo, áudio e compartilhamento de tela via LiveKit.
- Modo foco (spotlight), atalhos de teclado (M = microfone, C = câmera, S = tela, F = foco, Esc = sair).
- Reações rápidas, indicador de qualidade de conexão, contagem de participantes por canal em tempo real.

**Comunidade**
- Chat persistente por canal, com pesquisa de mensagens.
- Presença (online / ausente / não perturbe) e perfil editável (nome de exibição) para membros.
- Notificações internas (toasts) com histórico local e sons configuráveis.
- Tema escuro (padrão) e tema claro.

**Moderação e administração**
- Mover participantes entre canais (qualquer membro autenticado).
- Silenciar ou desconectar participantes de uma call (somente administradores).
- Centro de Comando: métricas gerais, usuários (cargo/status), convites, canais (categoria, ícone, acesso de convidado, sala de espera) e configurações do servidor (modo manutenção, logs no Discord, limite de usuários por call).
- Log de atividades administrativas (quem fez o quê e quando).
- Auditoria de acessos enviada para um canal do Discord via webhook.

## Arquitetura e stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 14 (App Router) + React 18 |
| Autenticação e banco | Supabase (Auth + Postgres) |
| Chamadas de voz/vídeo | LiveKit (`livekit-client`, `livekit-server-sdk`, `@livekit/components-react`) |
| Notificações de auditoria | Webhook do Discord |
| Hospedagem | Vercel |

Todas as tabelas sensíveis do Supabase (perfis, convites, canais, sessões de convidado, configurações, mensagens, logs) ficam com **Row Level Security ativado e sem políticas para `anon`/`authenticated`** — ou seja, o navegador nunca acessa essas tabelas diretamente. Toda leitura e escrita passa pelas rotas de API do Next.js, que usam a Service Role Key no servidor depois de verificar quem está fazendo a requisição.

## Como o acesso funciona

**Membros e administradores**
1. Fazem login com e-mail/senha pelo Supabase Auth.
2. O front-end guarda a sessão do Supabase e manda o `access_token` no header `Authorization: Bearer` em toda chamada de API.
3. Cada rota valida esse token com `supabase.auth.getUser()`, busca o perfil (`role`, `status`) na tabela `profiles` e só então decide o que autorizar.

**Convidados**
1. Informam um código de convite na tela inicial.
2. `POST /api/validate-invite` confere o código (comparando o hash, nunca o texto puro), marca o convite como usado de forma atômica e cria uma sessão em `guest_sessions`.
3. Um "passe" assinado (HMAC) é devolvido como cookie **HttpOnly, `SameSite=Strict`** — nunca fica acessível para JavaScript no navegador, o que impede que ele seja roubado por um script malicioso na página.
4. Esse cookie é reenviado automaticamente pelo navegador em toda chamada de API subsequente; o servidor sempre confere o cookie contra a linha correspondente em `guest_sessions` (permitindo revogar acesso a qualquer momento, inclusive ao fazer logout).

Nenhuma rota confia em `username`, `role` ou identidade vindos do cliente — tudo é derivado da sessão (membro) ou do passe validado (convidado) no servidor.

## Papéis e permissões

| Ação | Convidado | Membro | Admin |
|---|:---:|:---:|:---:|
| Entrar em canais com "acesso de convidado" ativado | ✅ | ✅ | ✅ |
| Entrar em qualquer canal ativo | ❌ | ✅ | ✅ |
| Enviar mensagens no chat do canal | ✅* | ✅ | ✅ |
| Editar próprio perfil (nome de exibição) | ❌ | ✅ | ✅ |
| Mover participantes entre canais | ❌ | ✅ | ✅ |
| Silenciar / desconectar participantes | ❌ | ❌ | ✅ |
| Acessar o Centro de Comando (`/admin`) | ❌ | ❌ | ✅ |
| Criar usuários, gerar/revogar convites, gerir canais e configurações | ❌ | ❌ | ✅ |

\* apenas nos canais em que o convidado tem acesso liberado.

## Estrutura do projeto

```
app/
  page.js                          # Tela de entrada (login + convite)
  layout.js                        # Layout raiz, temas e sincronização de canais
  servidor/page.js                 # Workspace principal (canais, chamada, chat)
  admin/
    layout.js
    page.js                        # Centro de Comando
  api/
    token/route.js                 # Emite o token do LiveKit (membro ou convidado)
    validate-invite/route.js       # Valida convite e cria a sessão de convidado
    guest/
      session/route.js             # Consulta a sessão de convidado atual
      logout/route.js              # Revoga a sessão e limpa o cookie
    channels/route.js              # Lista canais visíveis para o usuário atual
    channels/presence/route.js     # Participantes ao vivo por canal (para a sidebar)
    messages/route.js              # Chat por canal (GET/POST)
    presence/route.js              # Atualiza status de presença do membro
    profile/route.js               # Consulta/edita o perfil do membro
    moderation/route.js            # Silenciar/desconectar participante (admin)
    admin/
      create-user/route.js         # Cria conta de membro/admin
      manage/route.js              # CRUD de usuários, convites, canais e configurações
      participants/route.js        # Lista e move participantes entre canais
lib/
  supabaseAdmin.js                 # Client do Supabase com a Service Role Key
  requestAuth.js                   # Identifica quem está fazendo a requisição (sessão ou convidado)
  guestTicket.js                   # Assina/valida o passe de convidado (HMAC)
components/
  RoomExperience.js                # Ponto de entrada da UI de chamada
  CallPolishSafe.js                # Implementação da chamada (vídeo, chat, controles)
  AdminCategoryOrder.js            # Reordenação de categorias de canais (admin)
  ChannelSync.js                   # Detecta mudanças de canais e atualiza a tela
  CpxPalette.js                    # Paleta de cores dinâmica a partir do fundo de login
  ui.js                            # Componentes visuais compartilhados (ícones, modal, toast...)
supabase/migrations/
  20260917_cpx_hardening.sql       # Tabelas e políticas de segurança principais
  20260917_cpx_ui.sql              # Tabelas de chat, presença e logs de atividade
```

## Pré-requisitos

- Node.js 20+
- Uma conta e um projeto no [Supabase](https://supabase.com)
- Uma conta e um projeto no [LiveKit Cloud](https://cloud.livekit.io) (ou um servidor LiveKit próprio)
- (Opcional) um webhook do Discord, para receber os logs de auditoria

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

| Variável | Descrição |
|---|---|
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Credenciais do projeto LiveKit. **Nunca** prefixar com `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_LIVEKIT_URL` | URL `wss://` do servidor LiveKit. |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anônima do Supabase (usada só para autenticação, nunca para ler/escrever dados sensíveis). |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço do Supabase, usada apenas no servidor. **Nunca** prefixar com `NEXT_PUBLIC_` nem expor ao navegador. |
| `GUEST_TICKET_SECRET` | Segredo (32+ caracteres aleatórios) usado para assinar o passe de convidado. Gere com `openssl rand -hex 32`. |
| `DISCORD_WEBHOOK_URL` | URL do webhook do Discord para os logs de auditoria (opcional). |

## Banco de dados (Supabase)

Execute as migrações no SQL Editor do Supabase, **nesta ordem**:

1. `supabase/migrations/20260917_cpx_hardening.sql` — cria/ajusta `profiles`, `invites`, `channels`, `server_settings`, `guest_sessions` e `rate_limits`; ativa RLS em todas elas; cria a função `consume_rate_limit`.
2. `supabase/migrations/20260917_cpx_ui.sql` — adiciona presença ao perfil, categorias/descrição/ícone aos canais, e cria `channel_messages` e `activity_logs`.

As duas migrações são idempotentes (usam `if not exists` / `if exists`) e seguras para rodar mais de uma vez.

## Rodando localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`. Para testar o fluxo de administrador, crie o primeiro usuário admin diretamente no Supabase (Authentication → Add user) e defina `role = 'admin'` na tabela `profiles` correspondente — depois disso, novos usuários podem ser criados pelo próprio Centro de Comando.

## Deploy (Vercel)

1. Rode as duas migrações no Supabase de produção antes do primeiro deploy.
2. Configure todas as variáveis de ambiente da seção anterior no painel do projeto na Vercel.
3. Faça o deploy normalmente — o `.github/workflows/build.yml` já roda `npm run build` a cada push/PR para `main`, pegando erros de build antes de chegar na Vercel.

## Rotas da API

| Rota | Método | Quem acessa | Descrição |
|---|---|---|---|
| `/api/token` | GET | Membro ou convidado | Emite o token de acesso ao LiveKit para um canal |
| `/api/validate-invite` | POST | Público | Valida um código de convite e inicia a sessão de convidado |
| `/api/guest/session` | GET | Convidado | Consulta os dados da sessão de convidado atual |
| `/api/guest/logout` | POST | Convidado | Revoga a sessão e limpa o cookie |
| `/api/channels` | GET | Membro ou convidado | Lista os canais visíveis para o usuário |
| `/api/channels/presence` | GET | Membro ou convidado | Participantes ao vivo em cada canal |
| `/api/messages` | GET / POST | Membro ou convidado | Lê/envia mensagens do chat de um canal |
| `/api/presence` | POST | Membro | Atualiza o status de presença |
| `/api/profile` | GET / PATCH | Membro ou convidado | Consulta/edita o próprio perfil |
| `/api/moderation` | POST | Admin | Silencia ou desconecta um participante |
| `/api/admin/create-user` | POST | Admin | Cria uma nova conta de membro/admin |
| `/api/admin/manage` | GET / POST | Admin | Lista e gerencia usuários, convites, canais e configurações |
| `/api/admin/participants` | GET / POST | Membro ou admin | Lista participantes e move entre canais |

## Segurança

- **Nenhuma rota confia em dados de identidade vindos do cliente** — tudo é derivado da sessão do Supabase ou do passe de convidado, verificados no servidor a cada requisição.
- **Rate limiting no banco** (`consume_rate_limit`), resistente a múltiplas instâncias do servidor, aplicado em `/api/token` e `/api/validate-invite`.
- **Códigos de convite nunca são salvos em texto puro** — apenas o hash SHA-256 e os últimos 4 caracteres, para exibição.
- **Sessão de convidado em cookie `HttpOnly`**, com revogação possível a qualquer momento via `guest_sessions`.
- **RLS travado** em todas as tabelas sensíveis — só o backend, com a Service Role Key, acessa os dados.
- **Salvaguardas contra autoadministração indevida**: um admin não consegue suspender, rebaixar de cargo ou excluir a própria conta.
- **Modo manutenção e limite de usuários por call são aplicados de verdade** em `/api/token`, não apenas exibidos na interface.
- **Log de auditoria completo** (`activity_logs`) para toda ação administrativa, e notificação de acessos/bloqueios via Discord.

## Observações e manutenção

- O tema é escolhido pelo usuário e salvo em `localStorage` (preferência de interface, não dado sensível).
- Convites expirados, revogados ou já usados continuam visíveis no histórico do Centro de Comando, apenas com o status correspondente.
- Ao remover um canal, as mensagens associadas a ele também são removidas (`on delete cascade` em `channel_messages`).


## Ativação de contas por e-mail
- O administrador cria contas informando somente e-mail e cargo.
- Nesta branch, o Clerk envia o convite de ativação; o Supabase permanece como banco de dados.
- Na primeira entrada pelo convite, a pessoa escolhe o próprio username e define a senha.
- Admins podem ver o estado de confirmação do e-mail e reenviar a ativação para contas pendentes.
- Endpoint de reenvio: `POST /api/admin/resend-user-invite`.


## Migração para Clerk — branch `feature/clerk-auth-migration`

- Clerk substitui o Supabase Auth para login, sessões, senhas e convites.
- Supabase continua sendo usado para dados da aplicação, LiveKit e Realtime.
- Configure `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` e `CLERK_SECRET_KEY` nos ambientes da Vercel.
- Execute `supabase/migrations/20260920_clerk_auth.sql` no projeto Supabase antes do primeiro teste.
- No Clerk, habilite e-mail/senha e username no cadastro e configure o fluxo de convite.
- Contas são criadas pelo administrador por convite; o papel `admin` ou `membro` é enviado em metadata do convite.
- O perfil do Supabase é vinculado ao usuário Clerk por `profiles.clerk_user_id`; `pending_email` permite vincular o convite ao perfil antes do cadastro.
- Usuários antigos do Supabase Auth não são migrados automaticamente nesta branch; para os testes atuais, crie novamente as contas pelo fluxo de convite do Clerk.
