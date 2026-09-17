import './globals.css';
import './cpx-extra.css';
import './workspace-overrides.css';
import './cpx-identity.css';
import CpxPalette from '../components/CpxPalette';

export const metadata = {
  title: 'CPX Call',
  description: 'Comunidade CPX — chamadas de voz e vídeo.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body><CpxPalette />{children}</body>
    </html>
  );
}
