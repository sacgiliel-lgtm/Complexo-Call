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
  const { userId, user } = identity;
  const metadataEmail = String(user?.publicMetadata?.pendingEmail || '').trim().toLowerCase();
  let email = identity.email || metadataEmail;
  const profileLookup = await admin
    .from('profiles')
    .select('id,username,role,status,presence_status,last_seen_at,clerk_user_id,pending_email')
    .eq('clerk_user_id', userId)
    .maybeSingle();

  if (profileLookup.error) {
    console.error('Clerk profile sync: linked profile lookup failed.', profileLookup.error);
    return { ok: false, status: 500, error: 'Não foi possível consultar o vínculo da sua conta. Verifique se a migração do Clerk foi executada no Supabase.' };
  }

  let profile = profileLookup.data;

  if (profile && metadataEmail && !profile.pending_email) {
    const metadataRepair = await admin.from('profiles')
      .update({ pending_email: metadataEmail })
      .eq('id', profile.id)
      .select('id,username,role,status,presence_status,last_seen_at,clerk_user_id,pending_email')
      .single();

    if (!metadataRepair.error && metadataRepair.data) {
      profile = metadataRepair.data;
      console.info('Clerk profile sync: recovered pending email from invitation metadata.');
    } else if (metadataRepair.error) {
      console.warn('Clerk profile sync: could not recover pending email from invitation metadata.', metadataRepair.error);
    }
  }

  if (!profile && email) {
    const pendingLookup = await admin
      .from('profiles')
      .select('id,username,role,status,presence_status,last_seen_at,clerk_user_id,pending_email')
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
        .select('id,username,role,status,presence_status,last_seen_at,clerk_user_id,pending_email')
        .single();

      if (pendingUpdate.error) {
        console.error('Clerk profile sync: failed to link pending profile.', pendingUpdate.error);
        return { ok: false, status: 500, error: 'Não foi possível vincular sua ativação ao perfil. Tente novamente.' };
      }

      profile = pendingUpdate.data;
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
      : false,
    }).select('id,username,role,status,presence_status,last_seen_at,clerk_user_id,pending_email').single();
    if (error) return { ok: false, status: 500, error: 'Não foi possível criar o perfil da conta.' };
    profile = created;
  }

  if (profile.status === 'suspenso') return { ok: false, status: 403, error: 'Sua conta está suspensa.' };

  // Perfis criados durante a migração podem ter o e-mail salvo em
  // pending_email, enquanto o usuário Clerk ainda não possui esse endereço.
  // Como esse e-mail foi informado pelo administrador no convite, podemos
  // reparar a identificação automaticamente e mantê-la como verificada/principal.
  const repairEmail = String(profile?.pending_email || metadataEmail || email || '').trim().toLowerCase();
  if (repairEmail) {
    const pendingEmail = repairEmail;
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
        if (clerkCode === 'form_identifier_exists') {
          return {
            ok: false,
            status: 409,
            error: 'O e-mail desta solicitação já está vinculado a outra conta no Clerk.',
          };
        }
        throw error;
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

    if (profile && !profile.pending_email) {
      const pendingEmailRepair = await admin.from('profiles')
        .update({ pending_email: pendingEmail })
        .eq('id', profile.id)
        .select('id,username,role,status,presence_status,last_seen_at,clerk_user_id,pending_email')
        .single();
      if (!pendingEmailRepair.error && pendingEmailRepair.data) {
        profile = pendingEmailRepair.data;
      }
    }
  }

  const desiredUsername = user.username || profile.username;
  if (desiredUsername && desiredUsername !== profile.username) {
    const { data: duplicate } = await admin.from('profiles').select('id').ilike('username', desiredUsername).neq('id', profile.id).maybeSingle();
    if (!duplicate) {
      const { data: updated } = await admin.from('profiles').update({ username: desiredUsername }).eq('id', profile.id).select('id,username,role,status,presence_status,last_seen_at,clerk_user_id,pending_email').single();
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
