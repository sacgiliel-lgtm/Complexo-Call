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

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha os valores de Supabase, LiveKit e Discord. Nunca publique segredos no Git.

## Banco de dados

Execute no Supabase SQL Editor, nesta ordem:

1. `supabase/migrations/20260917_cpx_hardening.sql`
2. `supabase/migrations/20260917_cpx_ui.sql`

A segunda migração cria os campos de presença e canais, chat persistente e logs de atividade.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

O workflow `.github/workflows/build.yml` também verifica automaticamente o build nos pushes da branch e nos pull requests para `main`.
