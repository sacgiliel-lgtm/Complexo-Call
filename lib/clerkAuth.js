import { auth, currentUser, clerkClient } from '@clerk/nextjs/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from './supabaseAdmin';

function emailOf(user) {
  return user?.emailAddresses?.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress
    || user?.emailAddresses?.[0]?.emailAddress
    || '';
}

function fallbackUsername(user, email) {
  return user?.username || email.split('@')[0] || `usuario-${String(user?.id || '').slice(-8)}`;
}

export async function getClerkIdentity() {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return null;
  const user = await currentUser();
  if (!user) return null;
  return { userId, user, email: emailOf(user) };
}

export async function syncClerkProfile() {
  const identity = await getClerkIdentity();
  if (!identity) return { ok: false, status: 401, error: 'Sessão inválida ou expirada.' };

  const admin = getSupabaseAdmin();
  const { userId, user, email } = identity;
  let { data: profile } = await admin
    .from('profiles')
    .select('id,username,role,status,presence_status,last_seen_at,must_change_password,clerk_user_id,pending_email')
    .eq('clerk_user_id', userId)
    .maybeSingle();

  if (!profile && email) {
    const { data: pending } = await admin
      .from('profiles')
      .select('id,username,role,status,presence_status,last_seen_at,must_change_password,clerk_user_id,pending_email')
      .ilike('pending_email', email)
      .maybeSingle();
    if (pending) {
      const { data: linked } = await admin.from('profiles')
        .update({ clerk_user_id: userId, pending_email: email })
        .eq('id', pending.id)
        .select('id,username,role,status,presence_status,last_seen_at,must_change_password,clerk_user_id,pending_email')
        .single();
      profile = linked || pending;
    }
  }

  if (!profile) {
    const invitedRole = user.publicMetadata?.role;
    if (!['admin', 'membro'].includes(invitedRole)) {
      return { ok: false, status: 403, error: 'Esta conta não foi criada por um administrador do Complexo Call.' };
    }
    const role = invitedRole;
    const username = fallbackUsername(user, email);
    const { data: created, error } = await admin.from('profiles').insert({
      id: crypto.randomUUID(),
      clerk_user_id: userId,
      pending_email: email || null,
      username,
      role,
      status: 'ativo',
      presence_status: 'offline',
      must_change_password: false,
    }).select('id,username,role,status,presence_status,last_seen_at,must_change_password,clerk_user_id,pending_email').single();
    if (error) return { ok: false, status: 500, error: 'Não foi possível criar o perfil da conta.' };
    profile = created;
  }

  if (profile.status === 'suspenso') return { ok: false, status: 403, error: 'Sua conta está suspensa.' };

  const desiredUsername = user.username || profile.username;
  if (desiredUsername && desiredUsername !== profile.username) {
    const { data: duplicate } = await admin.from('profiles').select('id').ilike('username', desiredUsername).neq('id', profile.id).maybeSingle();
    if (!duplicate) {
      const { data: updated } = await admin.from('profiles').update({ username: desiredUsername }).eq('id', profile.id).select('id,username,role,status,presence_status,last_seen_at,must_change_password,clerk_user_id,pending_email').single();
      if (updated) profile = updated;
    }
  }

  return { ok: true, type: 'member', id: profile.id, clerkUserId: userId, email, username: profile.username || fallbackUsername(user, email), role: profile.role || 'membro', profile, admin, clerkUser: user };
}

export async function getRequestClerkIdentity() {
  const identity = await syncClerkProfile();
  return identity;
}

export async function requireAdminFromClerk() {
  const actor = await syncClerkProfile();
  if (!actor.ok) return actor;
  if (actor.role !== 'admin') return { ok: false, status: 403, error: 'Apenas administradores ativos.' };
  return actor;
}

export async function getClerkClient() {
  return clerkClient();
}
