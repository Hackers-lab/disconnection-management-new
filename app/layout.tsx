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
        <meta name="google-site-verification" content="_zL3hxgZcdJpdJXB1SmGsYJSCPgcb7y6foaNqdapx7M" />
      </head>
      <body>
        <AuthInterceptor />
        {children}
        <SpeedInsights />
      </body>
    </html>
  )
}

