export const metadata = {
  title: 'Discord Clone - LiveKit',
  description: 'Clone de servidor Discord rodando no Vercel',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#313338', color: '#fff' }}>
        {children}
      </body>
    </html>
  );
}
