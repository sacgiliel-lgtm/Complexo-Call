import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';
import { verifyGuestTicket } from '../../../lib/guestTicket';
import { limitarTaxa } from '../../../lib/rateLimit';

// Mantenha esta lista em sincronia com `canaisDeVoz` em app/servidor/page.js.
// Serve como whitelist: ninguém gera token pra uma "sala" inventada.
const SALAS_VALIDAS = ['Geral', 'Jogos', 'Reunião Dev'];

// Convidados (entraram via código de convite) só podem acessar estas salas.
const SALAS_CONVIDADO = ['Geral'];

// --- FUNÇÃO DE LOG DE AUDITORIA AVANÇADA PARA O DISCORD ---
async function enviarLogAuditoria(usuario, sala, cargo, ip, userAgent, bloqueado = false) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  // Cores dinâmicas para o Embed baseadas no cargo (Rosa para Admin, Roxo para Membro, Laranja para Convidado)
  let corEmbed = 10158312; // Roxo padrão (Membro)
  let badgeCargo = "Membro Comum";

  if (cargo === 'admin') {
    corEmbed = 15204456; // Rosa Neon (Admin)
    badgeCargo = "👑 Administrador (Acesso Total)";
  } else if (cargo === 'convidado') {
    corEmbed = 16753920; // Laranja/Amarelo (Convidado)
    badgeCargo = "🎫 Convidado (Restrito)";
  }

  if (bloqueado) {
    corEmbed = 14431557; // Vermelho — tentativa bloqueada
  }

  // Identifica de forma simples o dispositivo pelo User-Agent
  let dispositivo = "Desconhecido";
  if (userAgent) {
    if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
      dispositivo = "📱 Dispositivo Móvel (Celular)";
    } else {
      dispositivo = "💻 Computador / Desktop";
    }
  }

  const embed = {
    title: bloqueado
      ? "🚫 TENTATIVA DE ACESSO BLOQUEADA • COMPLEXO"
      : "🛡️ AUDITORIA DE ACESSO • COMPLEXO",
    description: bloqueado
      ? "Uma tentativa de entrar em uma sala não autorizada foi bloqueada pelo sistema."
      : "Uma tentativa de conexão e geração de token foi processada pelo sistema.",
    color: corEmbed,
    fields: [
      { name: "👤 Usuário", value: `\`${usuario}\``, inline: true },
      { name: "🏷️ Nível de Permissão", value: `**${badgeCargo}**`, inline: true },
      { name: "🔊 Canal Alvo", value: `\`# ${sala}\``, inline: false },
      { name: "🌐 Endereço IP", value: `||${ip || "Não capturado"}||`, inline: true },
      { name: "📱 Dispositivo", value: `\`${dispositivo}\``, inline: true },
      { name: "🔍 User-Agent Técnico", value: `\`\`\`${userAgent ? userAgent.substring(0, 100) + '...' : 'N/A'}\`\`\``, inline: false }
    ],
    footer: { text: "Protocolo de Segurança • Complexo Engine" },
    timestamp: new Date().toISOString()
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch (error) {
    console.error("Erro ao enviar log de auditoria pro Discord:", error);
  }
}

// --- ROTA DE GERAÇÃO DE TOKEN & AUDITORIA ---
// Agora exige uma credencial de verdade — sessão do Supabase (membro/admin)
// OU um ticket de convidado assinado (obtido em /api/validate-invite).
// O `username` e o `cargo` nunca mais vêm de query params do cliente.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const room = searchParams.get('room');

  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
  const userAgent = request.headers.get('user-agent');

  if (!room) {
    return Response.json({ error: 'Faltando room' }, { status: 400 });
  }

  if (!SALAS_VALIDAS.includes(room)) {
    return Response.json({ error: 'Sala inexistente' }, { status: 400 });
  }

  // Rate limit por IP — 10 gerações de token por minuto já é generoso pra uso normal
  const { permitido } = limitarTaxa(`token:${ip || 'desconhecido'}`, { maxRequisicoes: 10, janelaMs: 60 * 1000 });
  if (!permitido) {
    return Response.json({ error: 'Muitas tentativas. Aguarde um instante e tente de novo.' }, { status: 429 });
  }

  const authHeader = request.headers.get('authorization');
  const guestTicketHeader = request.headers.get('x-guest-ticket');

  let username = null;
  let cargo = null;

  try {
    if (authHeader?.startsWith('Bearer ')) {
      // --- Caminho 1: membro/admin com sessão real do Supabase ---
      const accessToken = authHeader.replace('Bearer ', '');

      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      );

      const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

      if (authError || !user) {
        return Response.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 });
      }

      const { data: perfil } = await supabase
        .from('profiles')
        .select('username, role')
        .eq('id', user.id)
        .single();

      username = perfil?.username || user.email?.split('@')[0] || `User_${user.id.slice(0, 6)}`;
      cargo = perfil?.role || 'membro';

    } else if (guestTicketHeader) {
      // --- Caminho 2: convidado com passe emitido após validar um convite ---
      const payload = verifyGuestTicket(guestTicketHeader);

      if (!payload) {
        return Response.json({ error: 'Convite expirado ou inválido. Valide o código novamente.' }, { status: 401 });
      }

      username = payload.username;
      cargo = 'convidado';

    } else {
      return Response.json({ error: 'Não autenticado. Faça login ou use um convite.' }, { status: 401 });
    }

    // --- Autorização: convidado só entra nas salas liberadas pra ele ---
    if (cargo === 'convidado' && !SALAS_CONVIDADO.includes(room)) {
      enviarLogAuditoria(username, room, cargo, ip, userAgent, true);
      return Response.json({ error: 'Convidados não podem entrar nesta sala.' }, { status: 403 });
    }

    // --- Gera o Token do LiveKit ---
    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      { identity: username }
    );

    at.addGrant({ roomJoin: true, room });
    const token = await at.toJwt();

    // Dispara o log detalhado para o canal do Discord em segundo plano
    enviarLogAuditoria(username, room, cargo, ip, userAgent, false);

    return Response.json({ token });

  } catch (error) {
    console.error("Erro crítico na auditoria de token:", error);
    return Response.json({ error: 'Erro interno ao processar acesso' }, { status: 500 });
  }
}
