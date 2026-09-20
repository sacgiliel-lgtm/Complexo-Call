import fs from 'node:fs/promises';

const secret = process.env.CLERK_SECRET_KEY?.trim();
const apiUrl = (process.env.CLERK_API_URL || 'https://api.clerk.com/v1').replace(/\/$/, '');

if (!secret) {
  console.error('CLERK_SECRET_KEY não está configurada.');
  process.exit(1);
}

const templatePath = new URL('../emails/clerk/invitation.html', import.meta.url);
const body = await fs.readFile(templatePath, 'utf8');

const response = await fetch(`${apiUrl}/templates/email/invitation`, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${secret}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'CPX Call — Convite de acesso',
    subject: 'Você recebeu um convite para o CPX Call',
    body,
    delivered_by_clerk: true,
  }),
});

const data = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error('Falha ao sincronizar template com o Clerk.');
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log('Template invitation sincronizado com o Clerk.');
console.log(JSON.stringify({
  slug: data.slug,
  name: data.name,
  delivered_by_clerk: data.delivered_by_clerk,
  updated_at: data.updated_at,
}, null, 2));
