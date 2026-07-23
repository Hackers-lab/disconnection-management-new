import type { Metadata } from 'next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { AuthInterceptor } from '@/components/auth-interceptor'
import './globals.css'

export const metadata: Metadata = {
  title: 'Disconnection Management',
  description: 'Created with love by Pramod Verma',
  generator: 'v0.2',
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
    <html lang="en">
      <head>
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
        <SpeedInsights />
      </body>
    </html>
  )
}


