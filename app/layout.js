import './globals.css';
import './cpx-extra.css';
import './workspace-overrides.css';
import './cpx-identity.css';
import './complexo-brand.css';
import './channel-members.css';
import CpxPalette from '../components/CpxPalette';
import { ClerkProvider } from '@clerk/nextjs';

export const metadata = {
  title: 'CPX Call',
  description: 'Comunidade CPX — chamadas de voz e vídeo.',
  icons: {
    icon: '/ComplexoVertical–Roxo.png',
    shortcut: '/ComplexoVertical–Roxo.png',
    apple: '/ComplexoVertical–Roxo.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body><ClerkProvider><CpxPalette />{children}</ClerkProvider></body>
    </html>
  );
}
