import { AccessToken } from 'livekit-server-sdk';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const room = searchParams.get('room');
  const username = searchParams.get('username');

  if (!room || !username) {
    return Response.json({ error: 'Faltando room ou username' }, { status: 400 });
  }

  try {
    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      { identity: username }
    );

    at.addGrant({ roomJoin: true, room: room });
    return Response.json({ token: await at.toJwt() });
  } catch (error) {
    console.error("Erro ao gerar token", error);
    return Response.json({ error: 'Erro interno ao gerar token' }, { status: 500 });
  }
}
