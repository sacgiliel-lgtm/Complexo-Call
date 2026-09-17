import './globals.css';
import './cpx-extra.css';

export const metadata = {
  title: 'CPX Call',
  description: 'Comunidade CPX — chamadas de voz e vídeo.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
