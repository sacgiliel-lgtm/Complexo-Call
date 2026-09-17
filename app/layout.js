import './globals.css';
import './cpx-extra.css';
import './workspace-overrides.css';
import './cpx-identity.css';
import './complexo-brand.css';
import CpxPalette from '../components/CpxPalette';
import ChannelSync from '../components/ChannelSync';

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
      <body><CpxPalette /><ChannelSync />{children}</body>
    </html>
  );
}
