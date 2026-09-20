import { clerkClient } from '@clerk/nextjs/server';
import { syncClerkProfile } from '../../../../lib/clerkAuth';
import { logDiscordEvent } from '../../../../lib/discordLogger';

export async function POST(request) {
  try {
    const actor = await syncClerkProfile();
    if (!actor.ok) return Response.json({ error: actor.error }, { status: actor.status || 401 });

    const body = await request.json().catch(() => ({}));
    const username = String(body.username || '').trim();
    const password = typeof body.password === 'string' ? body.password : '';

    if (username.length < 2 || username.length > 32) return Response.json({ error: 'O username deve ter entre 2 e 32 caracteres.' }, { status: 400 });
    if (!/^[\\p{L}\\p{N} _.-]+$/u.test(username)) return Response.json({ error: 'O username contém caracteres não permitidos.' }, { status: 400 });
    if (password && (password.length < 8 || password.length > 128)) return Response.json({ error: 'A senha deve ter entre 8 e 128 caracteres.' }, { status: 400 });

    const { data: duplicate } = await actor.admin.from('profiles').select('id').ilike('username', username).neq('id', actor.id).maybeSingle();
    if (duplicate) return Response.json({ error: 'Esse username já está em uso. Escolha outro.' }, { status: 409 });

    const client = await clerkClient();
    const updates = { username };
    if (password) updates.password = password;
    await client.users.updateUser(actor.clerkUserId, updates);

    const { data: profile, error } = await actor.admin.from('profiles')
      .update({ username, pending_email: actor.email || null })
      .eq('id', actor.id)
      .select('username,role,status')
      .single();
    if (error) return Response.json({ error: 'Não foi possível concluir a ativação do perfil.' }, { status: 500 });

    await logDiscordEvent({
      action: 'account_activated',
      actor: { id: actor.id, email: actor.email, username, role: actor.role },
      target: username,
      details: 'Conta ativada/configurada pelo próprio usuário via Clerk.',
    });

    return Response.json({ success: true, profile });
  } catch (error) {
    console.error('Activate account:', error);
    return Response.json({ error: error.message || 'Erro interno.' }, { status: 500 });
  }
}
