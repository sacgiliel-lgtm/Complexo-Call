# Complexo Call

Plataforma web de comunicação por voz e vídeo para a comunidade CPX, com canais organizados, chamadas em tempo real, chat, presença, convites temporários e ferramentas de administração.

O projeto usa **Next.js**, **Clerk**, **Supabase**, **LiveKit Cloud** e **Vercel**. A autenticação de membros foi migrada do Supabase Auth para o Clerk; o Supabase permanece responsável pelos dados da aplicação, enquanto o LiveKit continua responsável pela mídia em tempo real.

> **Status desta documentação:** alinhada à versão atual da branch `main` e ao deployment de produção.

---

## Sumário

- [Visão geral](#visão-geral)
- [Principais recursos](#principais-recursos)
- [Arquitetura](#arquitetura)
- [Stack](#stack)
- [Fluxos de autenticação](#fluxos-de-autenticação)
- [Fluxo de entrada em uma call](#fluxo-de-entrada-em-uma-call)
- [Reconexão automática do LiveKit](#reconexão-automática-do-livekit)
- [Fluxo de convidado](#fluxo-de-convidado)
- [Movimentação de participantes](#movimentação-de-participantes)
- [Papéis e permissões](#papéis-e-permissões)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Principais componentes](#principais-componentes)
- [APIs](#apis)
- [Banco de dados](#banco-de-dados)
- [Migrações do Supabase](#migrações-do-supabase)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Configuração do Clerk](#configuração-do-clerk)
- [Configuração do Supabase](#configuração-do-supabase)
- [Configuração do LiveKit](#configuração-do-livekit)
- [Configuração do Discord](#configuração-do-discord)
- [Execução local](#execução-local)
- [Deploy na Vercel](#deploy-na-vercel)
- [Branch e ambiente atual](#branch-e-ambiente-atual)
- [Segurança](#segurança)
- [Rate limiting](#rate-limiting)
- [Sessões e identidades](#sessões-e-identidades)
- [Identidade de participantes no LiveKit](#identidade-de-participantes-no-livekit)
- [Chat e Realtime](#chat-e-realtime)
- [Presença](#presença)
- [Heartbeat de presença](#heartbeat-de-presença)
- [Moderação](#moderação)
- [Centro de Comando](#centro-de-comando)
- [Health check](#health-check)
- [Testes automatizados](#testes-automatizados)
- [Limpeza de código legado](#limpeza-de-código-legado)
- [Manutenção e troubleshooting](#manutenção-e-troubleshooting)
- [Decisões e observações de arquitetura](#decisões-e-observações-de-arquitetura)
- [Scripts](#scripts)
- [Checklist de produção](#checklist-de-produção)

---

## Visão geral

O **Complexo Call** é uma aplicação web de chamadas de voz e vídeo inspirada na experiência de um servidor de comunicação com múltiplos canais.

A interface é dividida principalmente em três áreas:

### Tela inicial — `/`

Responsável por:

- login de membros e administradores;
- ativação de contas por convite;
- entrada de convidados por código;
- mensagens de erro e estado de autenticação;
- tratamento de links de convite e ativação.

### Servidor — `/servidor`

É o workspace principal da aplicação:

- canais agrupados por categoria;
- participantes conectados;
- áudio e vídeo;
- compartilhamento de tela;
- controles de microfone e câmera;
- estado e qualidade da conexão;
- chat por canal;
- presença;
- notificações;
- movimentação entre calls;
- recursos específicos para convidados.

### Centro de Comando — `/admin`

Área administrativa para gerenciar:

- usuários;
- cargos;
- status das contas;
- convites;
- canais;
- categorias e ordenação;
- configurações do servidor;
- modo manutenção;
- limite máximo de participantes;
- logs e atividades administrativas.

---

## Principais recursos

### Comunicação em tempo real

- chamadas de áudio;
- chamadas de vídeo;
- compartilhamento de tela;
- múltiplas salas independentes;
- conexão por LiveKit Cloud;
- listagem de participantes em cada sala;
- indicação de quem está falando;
- estados de microfone e câmera;
- indicador de qualidade da conexão;
- saída da call;
- modo de foco/spotlight;
- reações rápidas;
- atalhos de teclado.

### Canais

Os canais são persistidos no Supabase e podem possuir:

- nome;
- categoria;
- descrição;
- ícone;
- ordem;
- sala de espera;
- acesso de convidados;
- status ativo/inativo.

### Chat

Cada canal possui chat persistente armazenado no Supabase.

Recursos:

- envio e leitura de mensagens;
- até 500 caracteres por mensagem;
- histórico recente;
- pesquisa pela interface;
- atualização em tempo real por Supabase Realtime;
- associação da mensagem ao remetente;
- exclusão lógica através de `deleted_at`.

### Presença

Membros podem possuir estados:

- `online`;
- `away`;
- `busy`;
- `offline`.

O sistema também registra `last_seen_at`.

### Convites de convidados

Um membro autenticado pode criar um convite temporário para uma call, dependendo das configurações do servidor.

O convite possui:

- código aleatório;
- hash no banco;
- validade;
- nome do convidado;
- call de origem;
- estado de uso;
- possibilidade de revogação.

### Movimentação entre calls

Membros com permissão podem mover outro participante entre salas LiveKit.

O fluxo atual suporta:

- participante membro;
- participante convidado;
- validação da sala de origem;
- validação da sala de destino;
- validação de limite de participantes;
- validação de presença real no LiveKit;
- atualização da sala atual do convidado antes da movimentação;
- rollback da autorização do convidado caso o movimento falhe.

### Heartbeat de presença

Membros autenticados enviam um heartbeat periódico para:

```text
POST /api/presence
```

O intervalo atual é de aproximadamente **45 segundos**.

Além do intervalo periódico, o cliente atualiza a presença quando a aba volta a ficar visível e tenta marcar o usuário como `offline` no evento `pagehide`.

O heartbeat é apenas um mecanismo de atualização; a presença de participantes realmente conectados a uma call continua sendo obtida do LiveKit.

---
## Moderação

O sistema oferece ações de moderação em participantes conectados:

- desconectar participante;
- silenciar microfone publicado;
- impedir moderação da própria sessão.

### Auditoria

A aplicação pode registrar eventos em:

- `activity_logs`;
- webhook do Discord.

Exemplos de eventos:

- criação de conta;
- ativação de conta;
- criação de convite;
- acesso à call;
- acesso bloqueado;
- movimentação de participante;
- desconexão;
- silenciamento;
- outras ações administrativas.

---

## Arquitetura

A arquitetura atual separa autenticação, dados e mídia:

```text
                         ┌───────────────────────┐
                         │       Navegador       │
                         │  Next.js / React UI   │
                         └───────────┬───────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                │                    │                    │
                ▼                    ▼                    ▼
        ┌──────────────┐      ┌──────────────┐     ┌───────────────┐
        │    Clerk     │      │   Next.js    │     │ LiveKit Cloud │
        │              │      │  API Routes  │     │               │
        │ login/sessão │      │ autenticação │     │ áudio / vídeo │
        │ senha/convite│      │ autorização  │     │ screen share  │
        └──────────────┘      └──────┬───────┘     └───────────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │   Supabase   │
                              │ PostgreSQL   │
                              │ dados da app  │
                              │ Realtime      │
                              └──────────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │    Discord   │
                              │ webhook/logs │
                              └──────────────┘
```

### Responsabilidade de cada serviço

| Serviço | Responsabilidade |
|---|---|
| **Clerk** | identidade, login, senha, sessão, username e convites de membros |
| **Supabase PostgreSQL** | perfis, canais, convites, sessões de convidados, mensagens, presença, configurações e auditoria |
| **Supabase Realtime** | eventos de chat |
| **LiveKit Cloud** | transporte de áudio, vídeo, tela e estado dos participantes na sala |
| **Next.js / Vercel** | interface, APIs, autorização e integração entre serviços |
| **Discord Webhook** | auditoria e notificações operacionais |

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 14.2.35 |
| UI | React 18 |
| Autenticação | Clerk `@clerk/nextjs 6.39.7` |
| Banco | Supabase PostgreSQL |
| Cliente Supabase | `@supabase/supabase-js` |
| Realtime | Supabase Realtime |
| WebRTC / mídia | LiveKit Cloud |
| SDK cliente LiveKit | `livekit-client` |
| Componentes LiveKit | `@livekit/components-react` |
| SDK servidor LiveKit | `livekit-server-sdk` |
| Hospedagem | Vercel |
| Auditoria | Discord Webhook |

---

## Fluxos de autenticação

## Membros e administradores

A autenticação dos membros **não usa mais o Supabase Auth**.

O fluxo atual é:

```text
Clerk
  │
  ├── login por e-mail + senha
  ├── login por username + senha
  └── sessão Clerk
          │
          ▼
Next.js API
          │
          ▼
syncClerkProfile()
          │
          ▼
profiles.clerk_user_id
          │
          ▼
perfil / cargo / status
```

O servidor identifica o usuário pelo Clerk e então sincroniza ou localiza o perfil correspondente no Supabase.

O campo principal de vínculo é:

```text
profiles.clerk_user_id
```

O perfil interno continua possuindo seu próprio UUID:

```text
profiles.id
```

Isso desacopla o banco da identidade interna do provedor de autenticação.

### Login

A tela inicial utiliza o fluxo de login do Clerk diretamente:

```js
await signIn.create({
  identifier,
  password,
});
```

Quando o Clerk conclui a autenticação, a aplicação ativa a sessão e redireciona para `/servidor`.

### Username

O Clerk possui username próprio, mas o projeto também mantém o username no perfil do Supabase.

O sincronizador mantém os dois valores alinhados quando necessário.

---

## Ativação de contas

A criação de conta por administrador segue este fluxo:

```text
Admin
  │
  ├── informa e-mail
  └── escolhe cargo
          │
          ▼
/api/admin/create-user
          │
          ├── cria profile pendente no Supabase
          ├── gera activation token assinado
          └── cria invitation no Clerk
                    │
                    ▼
              e-mail do Clerk
                    │
                    ▼
             usuário abre convite
                    │
                    ├── escolhe username
                    └── define senha
                    │
                    ▼
             /api/profile/activate
                    │
                    ├── valida activation token
                    ├── vincula clerk_user_id
                    ├── garante e-mail no Clerk
                    ├── sincroniza perfil
                    └── finaliza ativação
```

O administrador não define a senha do novo usuário.

### Reenvio de convite

Existe uma rota específica para reenviar ativações pendentes:

```text
POST /api/admin/resend-user-invite
```

Os convites possuem validade e podem ser recriados quando necessário.

---

## Fluxo de entrada em uma call

Para membros:

```text
Usuário autenticado no Clerk
        │
        ▼
GET /api/token?room=NOME
        │
        ├── autentica com Clerk
        ├── sincroniza perfil
        ├── verifica cargo/status
        ├── verifica canal
        ├── verifica manutenção
        ├── verifica limite da call
        └── cria AccessToken do LiveKit
                    │
                    ▼
             cliente conecta
               ao LiveKit
```

O token recebe uma identidade correspondente ao usuário autenticado e metadata contendo:

```json
{
  "username": "Nome",
  "role": "membro"
}
```

A autorização do token permite:

- entrar na sala;
- publicar;
- assinar tracks.

---

## Reconexão automática do LiveKit

A experiência da call trata perdas temporárias de conexão como interrupções recuperáveis.

```text
conexão cai
   ↓
LiveKit entra em estado de reconexão
   ↓
UI mostra "Reconectando..."
   ↓
SDK tenta restaurar a sessão automaticamente
   ↓
RoomEvent.Reconnected
   ↓
UI confirma a recuperação
```

A interface aguarda uma janela de tolerância de aproximadamente **12 segundos** antes de considerar que a chamada foi definitivamente encerrada por uma desconexão inesperada.

Uma saída manual, como o botão **Sair** ou o atalho `Esc`, não passa por essa tolerância: a sessão é encerrada imediatamente.

Eventos de reconexão e recuperação também podem ser registrados em `activity_logs` e no webhook do Discord.

---
## Fluxo de convidado

Convidados não precisam de uma conta Clerk.

Fluxo:

```text
código de convite
      │
      ▼
POST /api/validate-invite
      │
      ├── valida hash do código
      ├── verifica expiração
      ├── verifica uso/revogação
      ├── cria guest_session
      └── cria ticket HMAC
              │
              ▼
       cookie HttpOnly
              │
              ▼
       APIs de convidado
              │
              ▼
       /api/token
              │
              ▼
          LiveKit
```

A identidade do convidado no LiveKit possui o formato:

```text
guest:<jti>
```

O banco mantém a sessão em:

```text
guest_sessions
```

O ticket é assinado por HMAC e não contém uma autorização confiável por si só: o backend ainda consulta a sessão correspondente no banco.

---

## Movimentação de participantes

A movimentação utiliza o recurso do servidor LiveKit:

```text
Sala A
  │
  │ moveParticipant(...)
  ▼
Sala B
```

Antes da operação, a API:

1. autentica quem está solicitando;
2. valida as duas salas;
3. verifica limite de participantes na sala destino;
4. confirma que o participante realmente está conectado à sala origem;
5. identifica se é um convidado;
6. para convidados, atualiza `current_room_name`;
7. executa o movimento no LiveKit;
8. em caso de falha, restaura o estado anterior do convidado.

### Por que `current_room_name` existe?

O convite original representa a sala para a qual o convidado foi inicialmente convidado.

Durante uma movimentação, a autorização precisa representar a **sala atual**.

Por isso existem dois conceitos:

```text
invites.room_name
    = sala original do convite

guest_sessions.current_room_name
    = sala atual do convidado
```

Essa separação evita que o convidado continue autorizado na sala antiga depois de ser movido.

---

## Papéis e permissões

| Recurso | Convidado | Membro | Admin |
|---|:---:|:---:|:---:|
| Entrar em canal permitido | ✅ | ✅ | ✅ |
| Entrar em qualquer canal ativo | ❌ | ✅ | ✅ |
| Usar áudio/vídeo | ✅ | ✅ | ✅ |
| Compartilhar tela | ✅ | ✅ | ✅ |
| Usar chat | ✅* | ✅ | ✅ |
| Alterar próprio perfil | ❌ | ✅ | ✅ |
| Mover outros participantes | ❌ | ✅ | ✅ |
| Silenciar participante | ❌ | ✅ | ✅ |
| Desconectar participante | ❌ | ✅ | ✅ |
| Criar convite para call | ❌ | ✅ | ✅ |
| Centro de Comando | ❌ | ❌ | ✅ |
| Criar usuários | ❌ | ❌ | ✅ |
| Gerenciar usuários | ❌ | ❌ | ✅ |
| Gerenciar canais | ❌ | ❌ | ✅ |
| Alterar configurações globais | ❌ | ❌ | ✅ |

* limitado à sala autorizada pelo convite do convidado.

> As permissões efetivas são determinadas no backend. A interface não é a camada de segurança.

---

## Estrutura do projeto

```text
Complexo-Call/
├── app/
│   ├── page.js
│   ├── layout.js
│   ├── servidor/
│   │   └── page.js
│   ├── admin/
│   │   ├── page.js
│   │   └── layout.js
│   ├── api/
│   │   ├── token/
│   │   │   └── route.js
│   │   ├── validate-invite/
│   │   │   └── route.js
│   │   ├── guest/
│   │   │   ├── session/route.js
│   │   │   └── logout/route.js
│   │   ├── channels/
│   │   │   ├── route.js
│   │   │   └── presence/route.js
│   │   ├── messages/
│   │   │   └── route.js
│   │   ├── presence/
│   │   │   └── route.js
│   │   ├── profile/
│   │   │   ├── route.js
│   │   │   ├── activate/route.js
│   │   │   ├── password/route.js
│   │   │   └── sync/route.js
│   │   ├── moderation/
│   │   │   └── route.js
│   │   ├── audit/
│   │   │   └── route.js
│   │   ├── call-invites/
│   │   │   └── route.js
│   │   └── admin/
│   │       ├── create-user/route.js
│   │       ├── manage/route.js
│   │       ├── participants/route.js
│   │       └── resend-user-invite/route.js
│   └── *.css
│
├── components/
│   ├── CallPolish.js
│   ├── CallPolishSafe.js
│   ├── RoomExperience.js
│   ├── AdminCategoryOrder.js
│   ├── CpxPalette.js
│   └── ui.js
│
├── lib/
│   ├── clerkAuth.js
│   ├── requestAuth.js
│   ├── guestTicket.js
│   ├── supabaseAdmin.js
│   └── supabaseClient.js
│
├── scripts/
│   └── sync-clerk-template.mjs
│
├── supabase/
│   └── migrations/
│       ├── 20260917_cpx_hardening.sql
│       ├── 20260917_cpx_ui.sql
│       ├── 20260917_call_invites.sql
│       ├── 20260918_cpx_passwords.sql
│       ├── 20260918_cpx_realtime.sql
│       ├── 20260919_guest_room_transfer.sql
│       └── 20260920_clerk_auth.sql
│
├── middleware.js
├── package.json
└── README.md
```

---

## Principais componentes

### `components/CallPolishSafe.js`

Componente principal da experiência da call:

- conexão ao LiveKit;
- mídia;
- participantes;
- controles;
- vídeo;
- áudio;
- compartilhamento;
- estado da call;
- interface da sala.

### `components/CallPolish.js`

Implementação de experiência da call e lógica visual adicional mantida no projeto.

### `components/RoomExperience.js`

Camada simples de composição/entrada da experiência da sala.

### `components/AdminCategoryOrder.js`

Gerencia a ordenação de categorias no Centro de Comando.

### `components/CpxPalette.js`

Gerencia a identidade visual/paleta da interface.

### `components/ui.js`

Componentes visuais reutilizáveis.

---

## Bibliotecas de autenticação e autorização

### `lib/clerkAuth.js`

É o núcleo da migração para Clerk.

Responsabilidades:

- obter a identidade Clerk atual;
- recuperar e-mail;
- localizar perfil;
- vincular `clerk_user_id`;
- recuperar `pending_email`;
- concluir sincronização;
- bloquear perfil suspenso;
- validar cargo;
- criar perfil quando permitido pelo metadata do convite;
- sincronizar username;
- disponibilizar cliente Clerk.

Principais funções:

- `getClerkIdentity()`;
- `syncClerkProfile()`;
- `getRequestClerkIdentity()`;
- `requireAdminFromClerk()`;
- `getClerkClient()`.

### `lib/requestAuth.js`

Unifica os modelos de acesso:

- membro/admin via Clerk;
- convidado via ticket HMAC.

A maioria das APIs internas usa:

```js
const actor = await getRequestActor(request);
```

O resultado representa quem está fazendo a requisição e inclui dados como:

- `id`;
- `username`;
- `role`;
- `type`;
- acesso ao Supabase server-side.

### `lib/guestTicket.js`

Responsável pelo ticket de convidado:

- criação;
- assinatura HMAC;
- validação;
- extração do cookie.

### `lib/supabaseAdmin.js`

Cria o cliente Supabase com a **Service Role Key** para operações internas do servidor.

---

## APIs

| Rota | Método | Acesso | Função |
|---|---|---|---|
| `/api/token` | GET | Membro/convidado | Gera token LiveKit; membros usam Clerk e convidados usam Guest Ticket |
| `/api/validate-invite` | POST | Público | Valida convite e cria sessão de convidado |
| `/api/guest/session` | GET | Convidado | Consulta sessão atual |
| `/api/guest/logout` | POST | Convidado | Revoga sessão |
| `/api/channels` | GET | Membro/convidado | Lista canais permitidos |
| `/api/channels/presence` | GET | Membro/convidado | Lista participantes LiveKit por canal |
| `/api/messages` | GET/POST | Membro/convidado | Chat do canal |
| `/api/presence` | POST | Membro | Atualiza presença |
| `/api/profile` | GET/PATCH | Membro | Consulta/atualiza perfil |
| `/api/profile/activate` | POST | Ativação Clerk | Finaliza ativação |
| `/api/profile/password` | POST | Membro | Altera a senha do usuário autenticado no Clerk |
| `/api/profile/sync` | GET | Membro | Força sincronização Clerk ↔ perfil |
| `/api/moderation` | POST | Membro/admin | Silencia/desconecta participante |
| `/api/call-invites` | POST | Membro/admin | Cria convite temporário para uma call |
| `/api/audit` | conforme implementação | Interno | Operações de auditoria |
| `/api/admin/create-user` | POST | Admin | Cria perfil pendente + convite Clerk |
| `/api/admin/resend-user-invite` | POST | Admin | Reenvia convite Clerk |
| `/api/admin/manage` | GET/POST | Admin | Administração geral |
| `/api/admin/participants` | GET/POST | Membro/admin | Lista e move participantes |

> A autorização real é sempre feita no servidor. Métodos e permissões acima descrevem o comportamento esperado da implementação atual.

---

## Banco de dados

O Supabase continua sendo o banco de dados principal da aplicação. O Supabase Auth não é utilizado pelo fluxo ativo de membros.

### `profiles`

Armazena:

- UUID interno;
- username;
- role;
- status;
- presença;
- último acesso;
- dados de perfil e estado de presença;
- `clerk_user_id`;
- `pending_email`.

### `channels`

Armazena:

- nome;
- ativo/inativo;
- sala de espera;
- acesso de convidado;
- ordem;
- categoria;
- descrição;
- ícone.

### `invites`

Armazena convites de convidados, incluindo:

- hash do código;
- prévia;
- nome;
- tipo;
- validade;
- uso;
- revogação;
- criador;
- sala.

O código completo não é armazenado em texto puro.

### `guest_sessions`

Armazena sessões temporárias de convidados:

- `jti`;
- convite;
- username;
- validade;
- revogação;
- `current_room_name`.

### `channel_messages`

Armazena as mensagens persistentes dos canais.

### `activity_logs`

Armazena ações de auditoria.

### `server_settings`

Configurações globais:

- manutenção;
- logs Discord;
- limite máximo de usuários;
- parâmetros de convites de call.

### `rate_limits`

Estado do rate limiting.

---

## Migrações do Supabase

Execute as migrações em ordem cronológica.

### 1. `20260917_cpx_hardening.sql`

Camada de segurança e estrutura base:

- perfis;
- convites;
- canais;
- configurações;
- sessões de convidados;
- rate limiting;
- RLS;
- função `consume_rate_limit`.

### 2. `20260917_cpx_ui.sql`

Recursos de interface:

- presença;
- categorias;
- descrição/ícones dos canais;
- chat;
- logs de atividade.

### 3. `20260917_call_invites.sql`

Recursos necessários para convites gerados diretamente dentro das calls.

### 4. `20260918_cpx_passwords.sql`

Migração histórica do modelo de senha anterior. Ela permanece no diretório para preservar o histórico, mas não faz parte do fluxo ativo do aplicativo.

### 5. `20260918_cpx_realtime.sql`

Ativa o fluxo de broadcast do chat através do Supabase Realtime.

### 6. `20260919_guest_room_transfer.sql`

Adiciona:

```text
guest_sessions.current_room_name
```

para permitir movimentação segura de convidados entre calls.

### 7. `20260920_clerk_auth.sql`

Migração da identidade para Clerk:

- remove a dependência estrutural de `profiles.id` → `auth.users.id`;
- adiciona `clerk_user_id`;
- adiciona `pending_email`;
- cria índice único de Clerk;
- cria índice de e-mail pendente;
- ajusta a política de leitura do perfil.

### 8. `20260921_observability.sql`

Adiciona metadados de observabilidade à tabela `activity_logs`:

- `ip_address`;
- `user_agent`;
- `request_id`;
- `source`.

Também cria índices para investigação por request e origem.

### 9. `20260921_clerk_auth_cleanup.sql`

Limpeza final da migração:

- remove o índice legado de `must_change_password`;
- remove a coluna `must_change_password` do perfil.

O arquivo `20260918_cpx_passwords.sql` permanece no repositório apenas como **histórico de migração**; a aplicação atual não depende dessa flag.

---

## Variáveis de ambiente

Configure estas variáveis localmente e na Vercel.

### Clerk

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: chave pública do Clerk.
- `CLERK_SECRET_KEY`: chave privada, somente no servidor.

### LiveKit

```env
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
NEXT_PUBLIC_LIVEKIT_URL=wss://seu-projeto.livekit.cloud
```

**Nunca** exponha `LIVEKIT_API_SECRET` no navegador.

### Supabase

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

A Service Role Key deve existir apenas no ambiente do servidor.

### Aplicação

```env
NEXT_PUBLIC_SITE_URL=https://complexo-call.vercel.app
```

É utilizada para construir URLs públicas de ativação/convite.

### Convidados

```env
GUEST_TICKET_SECRET=
```

Use um segredo aleatório longo, por exemplo:

```bash
openssl rand -hex 32
```

Esse valor nunca deve ser enviado ao cliente.

### Discord

```env
DISCORD_WEBHOOK_URL=
```

Opcional. Quando configurado, a aplicação pode enviar eventos de auditoria para o Discord.

---

## Configuração do Clerk

A configuração esperada é:

### Identificadores

Habilitar:

- e-mail;
- username;
- senha.

### Cadastro

O fluxo esperado é **invite-only**:

- usuários não criam contas publicamente;
- apenas administradores criam/iniciam novas contas;
- o convite é enviado pelo Clerk;
- o usuário escolhe o próprio username;
- o usuário define a própria senha.

### MFA

A aplicação atual foi preparada para o fluxo normal de:

```text
e-mail/username + senha
```

Recursos adicionais de segundo fator não fazem parte do fluxo principal atual.

### Metadata do convite

O convite do administrador utiliza metadata para manter o contexto da conta:

```json
{
  "role": "admin|membro",
  "pendingProfileId": "uuid",
  "pendingEmail": "usuario@exemplo.com"
}
```

Além disso, a rota de ativação utiliza um token assinado separado para vincular com segurança o perfil pendente.

---

## Configuração do Supabase

O navegador não precisa acessar diretamente as tabelas sensíveis.

As operações sensíveis passam por:

```text
Navegador
  ↓
Next.js API
  ↓
supabaseAdmin
  ↓
PostgreSQL
```

As tabelas sensíveis utilizam RLS.

### Regra de arquitetura

Não coloque a Service Role Key em:

- código client-side;
- `NEXT_PUBLIC_*`;
- localStorage;
- cookies acessíveis pelo JavaScript.

---

## Configuração do LiveKit

O projeto atual usa **LiveKit Cloud**.

O self-hosted LiveKit não faz parte da arquitetura ativa desta branch.

É necessário:

1. criar projeto no LiveKit Cloud;
2. obter `API Key`;
3. obter `API Secret`;
4. copiar a URL `wss://...`;
5. configurar as três variáveis da seção de ambiente.

### Token

O token LiveKit é emitido pelo backend da aplicação.

O navegador não recebe:

- API Secret;
- credenciais administrativas do LiveKit.

O backend cria um `AccessToken` e adiciona o grant da sala solicitada.

---

## Configuração do Discord

Quando `DISCORD_WEBHOOK_URL` está configurado, a aplicação pode enviar auditoria para o Discord.

Isso inclui informações como:

- usuário;
- cargo;
- canal;
- ação;
- IP quando disponível;
- user-agent;
- data/hora.

O webhook é opcional e não deve ser necessário para o funcionamento das chamadas.

---

## Execução local

Pré-requisitos:

- Node.js 20 ou superior;
- projeto Supabase;
- projeto Clerk;
- projeto LiveKit Cloud;
- Git;
- npm.

### Instalação

```bash
git clone https://github.com/sacgiliel-lgtm/Complexo-Call.git
cd Complexo-Call
npm install
```

### Variáveis

Crie:

```text
.env.local
```

e configure as variáveis necessárias.

### Banco

Execute as migrações no Supabase SQL Editor na ordem indicada.

### Desenvolvimento

```bash
npm run dev
```

A aplicação ficará disponível normalmente em:

```text
http://localhost:3000
```

### Build local

```bash
npm run build
```

### Inicialização de produção local

```bash
npm start
```

---

## Deploy na Vercel

A arquitetura atual utiliza a Vercel para hospedar a aplicação Next.js.

Fluxo:

```text
GitHub
  ↓
Vercel
  ↓
Next.js
  ├── Clerk
  ├── Supabase
  └── LiveKit
```

### Configuração

Na Vercel:

1. conecte o repositório;
2. configure as variáveis de ambiente;
3. use o ambiente correto para cada branch;
4. execute o build;
5. valide as APIs;
6. teste login e entrada nas calls.

### Domínio principal

O domínio principal atualmente configurado para a aplicação é:

```text
https://complexo-call.vercel.app
```

URLs de preview da Vercel podem existir para commits e branches sem substituir o domínio principal.

---

## Branch e ambiente atual

A migração do Clerk foi promovida para a branch principal:

```text
main
```

A `main` é a branch utilizada pelo deployment de produção atual. A branch `feature/clerk-auth-migration` permanece como histórico do trabalho de migração.

As validações principais incluem:

- login;
- ativação;
- convites;
- sessão;
- sincronização de perfil;
- presença;
- chat;
- token LiveKit;
- entrada em calls;
- moderação;
- movimentação entre calls;

antes de promover a alteração para `main`.

---

## Segurança

### Identidade no servidor

As APIs não devem confiar em:

- `role` enviado pelo navegador;
- `username` enviado pelo navegador;
- `identity` arbitrária para representar o próprio usuário;
- parâmetros de autorização não verificados.

A identidade de membros vem do Clerk.

A identidade de convidados vem do ticket assinado + sessão persistida.

### Service Role

A Service Role Key fica somente no servidor.

### Convites

Convites de convidados:

- são armazenados por hash;
- possuem validade;
- podem ser usados/revogados;
- possuem sessão separada.

### Ticket de convidado

O cookie é:

- HttpOnly;
- SameSite=Strict;
- Secure em produção.

Isso evita acesso direto ao ticket através de JavaScript no navegador.

### RLS

As tabelas sensíveis permanecem protegidas pelo Supabase RLS.

#### Metadados de auditoria

Os registros de `activity_logs` podem armazenar contexto adicional da requisição:

```text
IP
User-Agent
Request ID
Rota/origem
```

Isso facilita correlacionar um evento do Complexo Call com logs da Vercel ou de outro componente sem expor credenciais.

---
## Rate limiting

O endpoint de token utiliza rate limiting antes de emitir tokens LiveKit.

### Limite de participantes

Quando configurado, o limite da call é verificado no backend antes da entrada ou movimentação.

### Modo manutenção

Quando habilitado:

- usuários comuns não podem entrar;
- administradores continuam com acesso conforme a regra da aplicação.

---

## Rate limiting

O banco possui uma função:

```sql
public.consume_rate_limit(...)
```

Ela mantém contadores centralizados no PostgreSQL.

Isso evita depender somente de memória local de uma instância serverless.

O rate limiting é usado principalmente na emissão de tokens e validação de convites.

---

## Sessões e identidades

É importante diferenciar quatro IDs:

### `profiles.id`

UUID interno do perfil da aplicação.

É utilizado como identidade lógica dentro do banco.

### `profiles.clerk_user_id`

ID oficial do usuário no Clerk.

É o vínculo entre autenticação e perfil.

### Identidade LiveKit de membro

Normalmente:

```text
clerkUserId
```

### Identidade LiveKit de convidado

```text
guest:<jti>
```

### `guest_sessions.jti`

Identificador único da sessão temporária do convidado.

---

## Identidade de participantes no LiveKit

A identidade LiveKit é usada para:

- listar participantes;
- moderar;
- mover;
- comparar o participante com a sessão autenticada.

Por isso, a migração de Supabase Auth para Clerk alterou a identidade dos membros conectados ao LiveKit.

A arquitetura atual considera:

```text
Clerk identity
    ↓
profiles.clerk_user_id
    ↓
LiveKit participant.identity
```

Isso é importante ao investigar sessões antigas ou participantes que permaneceram conectados durante uma migração.

Quando todos os usuários reconectarem, a identidade tende a seguir o modelo Clerk de forma consistente.

---

## Chat e Realtime

As mensagens são armazenadas em:

```text
channel_messages
```

Ao inserir uma mensagem, o PostgreSQL executa o trigger:

```text
channel_messages_realtime_trigger
```

que publica:

```text
message_created
```

no canal lógico:

```text
cpx-chat:<channel_id>
```

Isso permite que a interface receba mensagens sem precisar fazer polling contínuo.

---

## Presença

A presença do membro é atualizada através da API:

```text
POST /api/presence
```

Os estados aceitos são:

```text
online
away
busy
offline
```

O backend atualiza:

- `presence_status`;
- `last_seen_at`.

A presença de participantes que estão realmente em uma call é complementar à presença do perfil e é obtida do LiveKit através da API de presença dos canais.

---

## Moderação

A moderação usa `RoomServiceClient` no backend.

### Desconectar

```js
service.removeParticipant(room, identity)
```

### Silenciar

O backend localiza a track de microfone e executa:

```js
service.mutePublishedTrack(...)
```

A própria sessão do moderador não pode ser alvo da operação.

---

## Centro de Comando

O `/admin` centraliza funções administrativas.

Entre as funções estão:

### Usuários

- listar;
- criar;
- ativar;
- suspender;
- alterar cargo;
- acompanhar status;
- reenviar convites.

### Canais

- criar;
- editar;
- ativar/desativar;
- definir categoria;
- escolher ícone;
- definir descrição;
- definir acesso de convidado;
- configurar sala de espera;
- ordenar categorias.

### Convites

- consultar;
- revogar;
- acompanhar validade;
- gerar convites para calls.

### Configurações

- modo manutenção;
- logs Discord;
- limite de participantes;
- configurações de convites.

---

## Health check

A aplicação possui:

```text
GET /api/health
```

O endpoint verifica:

- aplicação;
- configuração do Clerk;
- acesso ao PostgreSQL/Supabase;
- acesso administrativo ao LiveKit;
- configuração opcional do Discord.

Exemplo de resposta saudável:

```json
{
  "status": "ok",
  "ok": true
}
```

Quando um componente obrigatório não responde, a rota retorna HTTP `503` e informa um estado `degraded`.

O endpoint não expõe segredos nem credenciais dos serviços.

---
## Manutenção e troubleshooting

### Build falhando

Execute:

```bash
npm install
npm run build
```

Verifique principalmente:

- imports;
- chaves `{}`;
- variáveis de ambiente;
- rotas removidas;
- código server/client.

### Login Clerk falhando

Verifique:

1. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`;
2. `CLERK_SECRET_KEY`;
3. domínio configurado no Clerk;
4. se a conta realmente existe;
5. se o e-mail/username digitado corresponde ao cadastrado;
6. se a sessão Clerk está ativa;
7. se o perfil possui vínculo em `profiles.clerk_user_id`.

### Usuário autenticado, mas sem acesso ao servidor

Verifique:

```text
Clerk user
   ↓
profiles.clerk_user_id
   ↓
profiles.role
profiles.status
```

Um usuário Clerk válido sem perfil autorizado não deve ganhar acesso automaticamente.

### Erros ao gerar token LiveKit

Verifique:

- `NEXT_PUBLIC_LIVEKIT_URL`;
- `LIVEKIT_API_KEY`;
- `LIVEKIT_API_SECRET`;
- existência da sala no banco;
- canal ativo;
- modo manutenção;
- limite de participantes;
- erros do runtime da Vercel.

### Participante não aparece

Verifique:

1. se ele realmente está conectado ao LiveKit;
2. se a API de presença retorna a sala correta;
3. se a identidade LiveKit bate com o modelo atual;
4. se a call não foi encerrada;
5. se o endpoint `/api/channels/presence` está retornando corretamente.

### Convidado não consegue entrar

Verifique:

- validade do convite;
- `guest_sessions`;
- `cpx_guest_ticket`;
- `GUEST_TICKET_SECRET`;
- `current_room_name`;
- `invites.room_name`;
- status de revogação;
- canal destino.

### Convidado movido, mas interface mostra a sala antiga

O fluxo correto é:

```text
guest_sessions.current_room_name
            ↓
atualizado antes do move
            ↓
LiveKit moveParticipant
            ↓
cliente recebe mudança
            ↓
cliente consulta a sala atual
```

Caso a interface continue mostrando a sala anterior, o problema deve ser investigado na sincronização do estado client-side após o evento de mudança, e não somente no endpoint administrativo.

### Supabase

Se aparecer erro de sessão antiga ou autenticação Supabase no navegador, confirme se o código afetado ainda utiliza o fluxo legado.

A migração atual deve usar Clerk para autenticação de membros.

---

## Limpeza de código legado

A migração atual removeu os caminhos que já não possuem função no fluxo de produção:

- rota `/api/resolve-login`;
- resolução artificial por `externalId`;
- fallback de autenticação por `Authorization: Bearer` com token Supabase;
- consulta de usuários legados do Supabase Auth durante a sincronização Clerk;
- lógica de primeiro acesso baseada em `must_change_password`;
- uso de `must_change_password` no código ativo.

O banco recebe uma migração separada para remover a coluna legada sem reescrever o histórico das migrações antigas.

---
## Decisões e observações de arquitetura

### Clerk substituiu Supabase Auth

O Supabase Auth não é mais a fonte principal de identidade dos membros.

O papel de cada serviço ficou separado:

```text
Clerk      = identidade
Supabase   = dados da aplicação
LiveKit    = mídia em tempo real
Vercel     = execução da aplicação
Discord    = auditoria opcional
```

### Sem LiveKit self-hosted

O projeto atualmente usa **LiveKit Cloud**.

O self-hosted LiveKit não faz parte da arquitetura ativa atual. Não é necessário manter VPS própria apenas para o LiveKit nesta arquitetura.

### Sem Resend

Os e-mails de ativação dos membros são enviados pelo próprio fluxo de convite do Clerk.

Resend não é requisito da arquitetura atual.

### API como camada de segurança

O navegador não acessa diretamente as operações sensíveis.

A arquitetura procura manter:

```text
Client
  ↓
Next.js API
  ↓
authorization
  ↓
Supabase / LiveKit / Clerk server SDK
```

### Perfis internos independentes do Clerk

O UUID de `profiles.id` é independente do ID do Clerk.

Isso permite trocar novamente o provedor de autenticação sem precisar transformar o UUID interno do banco na identidade externa do provedor.

---

## Testes automatizados

O projeto possui uma suíte leve de testes com o runner nativo do Node.js.

### Executar testes

```bash
npm test
```

### Modo watch

```bash
npm run test:watch
```

### Verificação completa

```bash
npm run verify
```

O `npm run build` executa automaticamente `npm test` antes da compilação através do script `prebuild`.

Os testes cobrem principalmente:

- criação e validação de tickets HMAC de convidados;
- rejeição de tickets adulterados/expirados;
- ausência do fallback Supabase Auth na emissão de token LiveKit;
- remoção dos caminhos legados do Clerk;
- regras críticas de movimentação de participantes;
- proteção contra movimentar/moderar a própria sessão;
- presença por heartbeat;
- existência do health check;
- proteção de reconexão LiveKit;
- estrutura de auditoria.

---
## Scripts

### Desenvolvimento

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Produção local

```bash
npm start
```

### Lint

```bash
npm run lint
```

### Template Clerk

```bash
npm run sync:clerk-template
```

Esse script sincroniza o template utilizado no fluxo de desenvolvimento relacionado ao Clerk.

---

## Checklist de produção

Antes de promover alterações para o ambiente principal:

### Autenticação

- [ ] Login por e-mail funciona.
- [ ] Login por username funciona.
- [ ] Usuário inválido é rejeitado.
- [ ] Usuário suspenso é rejeitado.
- [ ] Conta convidada pelo admin é criada corretamente.
- [ ] E-mail de convite chega.
- [ ] Ativação cria username e senha.
- [ ] Reenvio de convite funciona.

### Calls

- [ ] Membro entra em uma sala.
- [ ] Convidado entra usando código.
- [ ] Áudio funciona.
- [ ] Vídeo funciona.
- [ ] Compartilhamento de tela funciona.
- [ ] Participantes aparecem corretamente.
- [ ] Microfone/câmera podem ser alternados.
- [ ] Saída da call funciona.

### Canais

- [ ] Canais ativos aparecem.
- [ ] Canais protegidos não aparecem para convidados.
- [ ] Categorias e ordem estão corretas.
- [ ] Sala de espera funciona.
- [ ] Limite máximo é respeitado.

### Chat

- [ ] Mensagem é enviada.
- [ ] Mensagem é salva.
- [ ] Mensagem aparece em tempo real.
- [ ] Histórico é carregado.

### Presença

- [ ] Online funciona.
- [ ] Ausente funciona.
- [ ] Ocupado funciona.
- [ ] Offline funciona.
- [ ] `last_seen_at` é atualizado.

### Moderação

- [ ] Membro consegue mover participante.
- [ ] Admin consegue mover participante.
- [ ] Participante pode ser desconectado.
- [ ] Microfone pode ser silenciado.
- [ ] Usuário não consegue moderar a si próprio.

### Convidados

- [ ] Convite expira corretamente.
- [ ] Convite revogado não funciona.
- [ ] Sessão temporária funciona.
- [ ] Cookie é HttpOnly.
- [ ] Guest move atualiza `current_room_name`.
- [ ] Guest não consegue acessar a sala errada.

### Infraestrutura

- [ ] Todas as variáveis da Vercel estão configuradas.
- [ ] Clerk está configurado no domínio correto.
- [ ] Supabase está com as migrações atualizadas.
- [ ] LiveKit Cloud está configurado.
- [ ] Webhook Discord está correto, quando utilizado.
- [ ] Build da Vercel está verde.
- [ ] Runtime logs não apresentam erros.
- [ ] Domínio principal aponta para o deployment esperado.

---

## Links principais

- Aplicação: https://complexo-call.vercel.app
- Repositório: https://github.com/sacgiliel-lgtm/Complexo-Call

---

## Licença

O projeto é privado no contexto atual do repositório e sua distribuição deve seguir as regras definidas pelos mantenedores do Complexo Call.
