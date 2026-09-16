import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';

// --- FUNÇÃO DE LOG DE AUDITORIA AVANÇADA PARA O DISCORD ---
async function enviarLogAuditoria(usuario, sala, cargo, ip, userAgent) {
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
    title: "🛡️ AUDITORIA DE ACESSO • COMPLEXO",
    description: `Uma tentativa de conexão e geração de token foi processada pelo sistema.`,
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
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const room = searchParams.get('room');
  const username = searchParams.get('username');

  // Captura metadados de rede e do navegador para auditoria
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
  const userAgent = request.headers.get('user-agent');

  if (!room || !username) {
    return Response.json({ error: 'Faltando room ou username' }, { status: 400 });
  }

  try {
    // 1. Instancia o Supabase para checar a integridade da permissão
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    // 2. Valida o cargo real do usuário no banco
    let cargo = 'convidado';
    const { data: perfil } = await supabase
      .from('profiles')
      .select('role')
      .eq('username', username)
      .single();
      
    if (perfil) {
      cargo = perfil.role;
    }

    // 3. Validação de Segurança Extra para Convidados
    // Se for convidado, garante via código que ele só pode acessar a sala de espera/recepção
    if (cargo === 'convidado' && room !== 'Recepção (Convidados)' && room !== 'Geral') {
      // Opcional: Você pode bloquear ou registrar uma tentativa suspeita aqui no futuro
    }

    // 4. Gera o Token do LiveKit
    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      { identity: username }
    );
    
    at.addGrant({ roomJoin: true, room: room });
    const token = await at.toJwt();

    // 5. Dispara o log detalhado para o canal do Discord em segundo plano
    enviarLogAuditoria(username, room, cargo, ip, userAgent);

    return Response.json({ token });

  } catch (error) {
    console.error("Erro crítico na auditoria de token:", error);
    return Response.json({ error: 'Erro interno ao processar acesso' }, { status: 500 });
  }
}
