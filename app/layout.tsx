import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import localFont from 'next/font/local'
import { AuthInterceptor } from '@/components/auth-interceptor'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const samarata = localFont({
  src: '../public/Samarata.ttf',
  variable: '--font-samarata',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Disconnection Management',
  description: 'Disconnection Management System',
  generator: 'v0.2',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/icon-192.png',
  },
  verification: {
    google: '_zL3hxgZcdJpdJXB1SmGsYJSCPgcb7y6foaNqdapx7M',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${samarata.variable}`}>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2563eb" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Disconnection Management" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="google-site-verification" content="_zL3hxgZcdJpdJXB1SmGsYJSCPgcb7y6foaNqdapx7M" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('beforeinstallprompt', function(e) {
                e.preventDefault();
                window.deferredPwaPrompt = e;
              });
            `,
          }}
        />
      </head>
      <body>
        <AuthInterceptor />
        {children}
      </body>
    </html>
  )
}


