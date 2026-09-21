import { clerkClient } from '@clerk/nextjs/server';
import { getRequestActor, actorResponse } from '../../../../lib/requestAuth';
import { logDiscordEvent } from '../../../../lib/discordLogger';

function validPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

export async function POST(request) {
  try {
    const actor = await getRequestActor(request);
    if (!actor.ok) return actorResponse(actor);
    if (actor.type !== 'member') return Response.json({ error: 'Convidados não podem alterar senha.' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (!validPassword(newPassword)) return Response.json({ error: 'A nova senha deve ter entre 8 e 128 caracteres.' }, { status: 400 });
    if (newPassword === currentPassword) return Response.json({ error: 'A nova senha precisa ser diferente da senha atual.' }, { status: 400 });

    const client = await clerkClient();
    await client.users.updateUser(actor.clerkUserId, { password: newPassword });

    await logDiscordEvent({ action: 'password_changed', actor, target: actor.username || actor.id, details: 'Senha alterada via Clerk.' });
    return Response.json({ success: true });
  } catch (error) {
    console.error('Password API:', error);
    return Response.json({ error: error.message || 'Não foi possível alterar a senha.' }, { status: 400 });
  }
}
