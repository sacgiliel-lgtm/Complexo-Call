function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildInvitationEmail({ invitationUrl, inviterName, expiresInDays, siteUrl }) {
  const safeUrl = escapeHtml(invitationUrl);
  const safeInviter = escapeHtml(inviterName || 'Administrador');
  const safeSiteUrl = String(siteUrl || '').replace(/\/$/, '');
  const logoUrl = safeSiteUrl + '/ComplexoVertical%E2%80%93Roxo.png';

  return {
    subject: 'Você recebeu um convite para o CPX Call',
    html: \`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Convite CPX Call</title>
</head>
<body style="margin:0;padding:0;background:#f4f1fb;font-family:Inter,Arial,Helvetica,sans-serif;color:#201a2d;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    \${safeInviter} convidou você para entrar no CPX Call.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f1fb;">
    <tr><td align="center" style="padding:34px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;">
        <tr><td align="center" style="padding:0 0 18px;">
          <a href="\${safeUrl}" style="text-decoration:none;">
            <img src="\${logoUrl}" alt="CPX Call" width="178" style="display:block;width:178px;max-width:72%;height:auto;border:0;">
          </a>
        </td></tr>
        <tr><td style="background:#17121f;border-radius:22px 22px 0 0;padding:34px 36px 30px;">
          <div style="font-size:11px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:#b9a4d8;font-weight:800;">Convite de acesso</div>
          <h1 style="margin:10px 0 0;color:#fff;font-size:30px;line-height:38px;letter-spacing:-.5px;font-weight:800;">Bem-vindo ao CPX Call</h1>
          <p style="margin:12px 0 0;color:#d8d2e2;font-size:15px;line-height:24px;">Você foi convidado para participar do espaço de chamadas e comunicação da comunidade CPX.</p>
        </td></tr>
        <tr><td style="background:#fff;border-radius:0 0 22px 22px;padding:34px 36px 38px;">
          <p style="margin:0 0 18px;font-size:15px;line-height:24px;">Olá!</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:24px;color:#51495e;"><strong style="color:#231c30;">\${safeInviter}</strong> convidou você para acessar o <strong style="color:#231c30;">CPX Call</strong>.</p>
          <p style="margin:0 0 26px;font-size:15px;line-height:24px;color:#51495e;">Para começar, aceite o convite e configure sua conta. Você poderá escolher o username que será exibido nas chamadas e criar sua senha.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center">
            <a href="\${safeUrl}" style="display:inline-block;background:#7c4dff;color:#fff;text-decoration:none;font-size:15px;line-height:20px;font-weight:800;padding:15px 28px;border-radius:12px;">Ativar meu acesso</a>
          </td></tr></table>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;background:#f7f4fb;border:1px solid #e9e2f3;border-radius:14px;"><tr><td style="padding:17px 20px;">
            <div style="font-size:11px;line-height:16px;letter-spacing:1.2px;text-transform:uppercase;color:#786c86;font-weight:800;">Validade</div>
            <div style="margin-top:6px;font-size:14px;line-height:22px;color:#2e2738;">Este convite é válido por <strong>\${escapeHtml(expiresInDays)} dias</strong>.</div>
          </td></tr></table>
          <p style="margin:24px 0 0;font-size:13px;line-height:21px;color:#7a7182;">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
          <p style="margin:8px 0 0;word-break:break-all;font-size:12px;line-height:19px;color:#6f48cf;">\${safeUrl}</p>
          <div style="margin-top:28px;padding-top:24px;border-top:1px solid #eee9f3;"><p style="margin:0;font-size:12px;line-height:19px;color:#8a8191;">Se você não esperava este convite, pode ignorar este e-mail com segurança.</p></div>
        </td></tr>
        <tr><td align="center" style="padding:18px 16px 0;">
          <p style="margin:0;font-size:12px;line-height:18px;color:#8d8397;">CPX Call · Conecte · converse · compartilhe</p>
          <p style="margin:6px 0 0;font-size:11px;line-height:17px;color:#a098a8;">Este é um e-mail automático. Não responda a esta mensagem.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>\`,
  };
}

export async function sendInvitationEmail({ to, invitationUrl, inviterName, expiresInDays, siteUrl }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    throw new Error('E-mail não configurado. Defina RESEND_API_KEY e EMAIL_FROM na Vercel.');
  }

  const email = buildInvitationEmail({ invitationUrl, inviterName, expiresInDays, siteUrl });

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${apiKey}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: email.subject,
      html: email.html,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error('Resend invitation email failed:', data);
    throw new Error(data?.message || data?.error || 'O provedor de e-mail recusou o envio.');
  }

  return data;
}
