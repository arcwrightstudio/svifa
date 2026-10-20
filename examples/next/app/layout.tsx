import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { SmoothScroll } from '@arcwrightstudio/svifa/react'
import '@arcwrightstudio/svifa/svifa.css'
import './globals.css'

export const metadata: Metadata = { title: 'Svifa with Next.js' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* the page glides, and so do same-page links, stopping below the sticky header */}
        <SmoothScroll subpixel="main > section" anchors={{ offset: -56 }}>
          {children}
        </SmoothScroll>
      </body>
    </html>
  )
}
