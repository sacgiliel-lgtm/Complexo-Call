import { getSupabaseAdmin } from './supabaseAdmin';

const COLORS = {
  success: 0x57f287,
  info: 0x5865f2,
  warning: 0xfee75c,
  danger: 0xed4245,
  neutral: 0x747f8d,
};

const LABELS = {
  participant_joined: 'Participante entrou',
  participant_left: 'Participante saiu',
  participant_muted: 'Participante silenciado',
  participant_disconnected: 'Participante desconectado',
  participant_moved: 'Participante movido',
  screen_share_started: 'Compartilhamento de tela iniciado',
  screen_share_stopped: 'Compartilhamento de tela encerrado',
  invite_created: 'Convite criado',
  invite_revoked: 'Convite revogado',
  call_invite_created: 'Convite de chamada criado',
  user_created: 'Usuário criado',
  user_updated: 'Usuário atualizado',
  user_deleted: 'Usuário excluído',
  password_changed: 'Senha alterada',
  profile_updated: 'Perfil atualizado',
  channel_created: 'Canal criado',
  channel_updated: 'Canal atualizado',
  channel_deleted: 'Canal excluído',
  category_reordered: 'Categorias reorganizadas',
  settings_updated: 'Configurações atualizadas',
  moderation: 'Ação de moderação',
  error: 'Erro da aplicação',
};

const ACTION_STYLE = {
  participant_joined: 'success',
  participant_left: 'neutral',
  participant_muted: 'warning',
  participant_disconnected: 'danger',
  participant_moved: 'info',
  screen_share_started: 'info',
  screen_share_stopped: 'neutral',
  invite_created: 'success',
  invite_revoked: 'warning',
  call_invite_created: 'success',
  user_created: 'success',
  user_updated: 'info',
  user_deleted: 'danger',
  password_changed: 'warning',
  profile_updated: 'info',
  channel_created: 'success',
  channel_updated: 'info',
  channel_deleted: 'danger',
  category_reordered: 'info',
  settings_updated: 'warning',
  moderation: 'warning',
  error: 'danger',
};

function truncate(value, max = 900) {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function getStyle(action) {
  return ACTION_STYLE[action] || (action.endsWith('_failed') ? 'danger' : 'info');
}

export async function logDiscordEvent({ action, actor, target, details, channel, status = 'success', source = 'CPX Call' }) {
  const admin = getSupabaseAdmin();
  const actorName = actor?.username || actor?.email || actor?.name || 'Sistema';
  const actorId = actor?.id || actor?.identity || null;
  const actionKey = String(action || 'info');
  const style = status === 'error' ? 'danger' : status === 'warning' ? 'warning' : getStyle(actionKey);

  let settings = null;
  try {
    const { data } = await admin.from('server_settings').select('discord_logs').eq('id', 1).maybeSingle();
    settings = data;
  } catch {}

  try {
    await admin.from('activity_logs').insert({
      actor_id: actorId,
      actor_name: actorName,
      action: actionKey,
      target: target ? truncate(target, 200) : null,
      details: details ? truncate(details, 1500) : null,
    });
  } catch (error) {
    console.error('Audit log:', error);
  }

  if (settings?.discord_logs === false || !process.env.DISCORD_WEBHOOK_URL) return;

  const embed = {
    title: LABELS[actionKey] || actionKey.replaceAll('_', ' '),
    color: COLORS[style] || COLORS.info,
    timestamp: new Date().toISOString(),
    footer: { text: source },
    fields: [
      { name: 'Ator', value: truncate(actorName, 256), inline: true },
      ...(target ? [{ name: 'Alvo', value: truncate(target, 256), inline: true }] : []),
      ...(channel ? [{ name: 'Canal', value: `#${truncate(channel, 240)}`, inline: true }] : []),
      ...(details ? [{ name: 'Detalhes', value: truncate(details, 900) }] : []),
    ],
  };

  try {
    const response = await fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'CPX • Auditoria',
        embeds: [embed],
        allowed_mentions: { parse: [] },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.error('Discord webhook:', response.status, await response.text().catch(() => ''));
    }
  } catch (error) {
    console.error('Discord webhook:', error);
  }
}
