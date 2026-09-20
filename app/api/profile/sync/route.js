import { syncClerkProfile } from '../../../../lib/clerkAuth';

export async function GET() {
  const actor = await syncClerkProfile();
  if (!actor.ok) return Response.json({ error: actor.error }, { status: actor.status || 401 });
  return Response.json({
    profile: {
      id: actor.id,
      clerkUserId: actor.clerkUserId,
      username: actor.username,
      role: actor.role,
      status: actor.profile.status,
      presence_status: actor.profile.presence_status || 'offline',
      must_change_password: false,
    },
  });
}
