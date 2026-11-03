import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/components/providers/auth-provider';
import { Toaster } from '@/components/ui/sonner';
import { APP_NAME } from '@/lib/brand';
import { WhatsAppFloat } from '@/components/shared/whatsapp';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — Gestão de Plaquinhas com QR Code`,
    template: `%s | ${APP_NAME}`,
  },
  applicationName: APP_NAME,
  description:
    'Plataforma completa para gerenciamento e venda de plaquinhas físicas com QR Code dinâmico.',
  openGraph: {
    title: `${APP_NAME} — Gestão de Plaquinhas com QR Code`,
    description:
      'Plataforma completa para gerenciamento e venda de plaquinhas físicas com QR Code dinâmico.',
    siteName: APP_NAME,
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0A0A0B',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`dark ${inter.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <AuthProvider>
          {children}
          <WhatsAppFloat />
          <Toaster
            position="top-center"
            toastOptions={{
              classNames: {
                toast:
                  'bg-card/90 backdrop-blur-xl border-white/10 text-card-foreground rounded-2xl',
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
