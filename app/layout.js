export const metadata = {
  title: 'Call com LiveKit',
  description: 'Sistema de videoconferência rodando no Vercel',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#000', color: '#fff' }}>
        {children}
      </body>
    </html>
  );
}
