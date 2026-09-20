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

async function findLegacyProfileByEmail(admin, email) {
  if (!email) return null;

  try {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) {
      console.warn('Clerk migration: could not inspect legacy Supabase users.', error);
      return null;
    }

    const legacyUser = (data?.users || []).find(
      (item) => item?.email && item.email.toLowerCase() === email.toLowerCase()
    );
    if (!legacyUser?.id) return null;

    const { data: legacyProfile, error: profileError } = await admin
      .from('profiles')
      .select('id,username,role,status,presence_status,last_seen_at,must_change_password,clerk_user_id,pending_email')
      .eq('id', legacyUser.id)
      .maybeSingle();

    if (profileError || !legacyProfile) return null;
    return legacyProfile;
  } catch (error) {
    console.warn('Clerk migration: legacy profile lookup failed.', error);
    return null;
  }
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
  const { userId, user } = identity;
  let email = identity.email;
  const profileLookup = await admin
    .from('profiles')
    .select('id,username,role,status,presence_status,last_seen_at,must_change_password,clerk_user_id,pending_email')
    .eq('clerk_user_id', userId)
    .maybeSingle();

  if (profileLookup.error) {
    console.error('Clerk profile sync: linked profile lookup failed.', profileLookup.error);
    return { ok: false, status: 500, error: 'Não foi possível consultar o vínculo da sua conta. Verifique se a migração do Clerk foi executada no Supabase.' };
  }

  let profile = profileLookup.data;

  if (!profile && email) {
    const pendingLookup = await admin
      .from('profiles')
      .select('id,username,role,status,presence_status,last_seen_at,must_change_password,clerk_user_id,pending_email')
      .ilike('pending_email', email)
      .maybeSingle();

    if (pendingLookup.error) {
      console.error('Clerk profile sync: pending profile lookup failed.', pendingLookup.error);
      return { ok: false, status: 500, error: 'Não foi possível consultar os convites de ativação. Verifique se a migração do Clerk foi executada no Supabase.' };
    }

    const pending = pendingLookup.data;
    if (pending) {
      const pendingUpdate = await admin.from('profiles')
        .update({ clerk_user_id: userId, pending_email: email })
        .eq('id', pending.id)
        .select('id,username,role,status,presence_status,last_seen_at,must_change_password,clerk_user_id,pending_email')
        .single();

      if (pendingUpdate.error) {
        console.error('Clerk profile sync: failed to link pending profile.', pendingUpdate.error);
        return { ok: false, status: 500, error: 'Não foi possível vincular sua ativação ao perfil. Tente novamente.' };
      }

      profile = pendingUpdate.data;
    }
  }

  if (!profile && email) {
    const legacyProfile = await findLegacyProfileByEmail(admin, email);
    if (legacyProfile) {
      const legacyUpdate = await admin.from('profiles')
        .update({ clerk_user_id: userId, pending_email: null })
        .eq('id', legacyProfile.id)
        .select('id,username,role,status,presence_status,last_seen_at,must_change_password,clerk_user_id,pending_email')
        .single();

      if (legacyUpdate.error) {
        console.error('Clerk profile sync: failed to link legacy profile.', legacyUpdate.error);
        return { ok: false, status: 500, error: 'Não foi possível migrar seu perfil para o Clerk. Tente novamente.' };
      }

      profile = legacyUpdate.data;
    }
  }

  if (!profile) {
    const invitedRole = user.publicMetadata?.role;
    if (!['admin', 'membro'].includes(invitedRole)) {
      console.warn('Clerk profile sync denied: no invited role or existing profile.', {
        userId,
        email,
        publicRole: invitedRole || null,
      });
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

  // Perfis criados durante a migração podem ter o e-mail salvo em
  // pending_email, enquanto o usuário Clerk ainda não possui esse endereço.
  // Como esse e-mail foi informado pelo administrador no convite, podemos
  // reparar a identificação automaticamente e mantê-la como verificada/principal.
  if (profile.pending_email) {
    const pendingEmail = String(profile.pending_email).trim().toLowerCase();
    const client = await clerkClient();
    const currentUser = await client.users.getUser(userId);
    const currentEmail = currentUser.emailAddresses?.find(
      (item) => String(item.emailAddress || '').trim().toLowerCase() === pendingEmail
    );

    if (!currentEmail) {
      try {
        await client.emailAddresses.createEmailAddress({
          userId,
          emailAddress: pendingEmail,
          primary: true,
          verified: true,
        });
      } catch (error) {
        const clerkCode = error?.errors?.[0]?.code;
        if (clerkCode !== 'form_identifier_exists') throw error;
      }
    } else {
      const isVerified = currentEmail.verification?.status === 'verified';
      const isPrimary = currentEmail.id === currentUser.primaryEmailAddressId;
      if (!isVerified || !isPrimary) {
        await client.emailAddresses.updateEmailAddress(currentEmail.id, {
          verified: true,
          primary: true,
        });
      }
    }

    if (!email) email = pendingEmail;
  }

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
