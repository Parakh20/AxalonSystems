import type { Metadata } from 'next'
import './globals.css'
import DynamicCursor from '@/components/DynamicCursor'
import Navbar from '@/components/Navbar'

export const metadata: Metadata = {
  title: 'Axalon Systems — Autonomous Solar Inspection',
  description:
    'AI-powered drone inspection for solar assets. Thermal + RGB computer vision with YOLOv8 for 11-class fault detection.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {/* Custom teal cursor */}
        <DynamicCursor />

        {/* Navbar floats at z-index 100 */}
        <Navbar />

        {/* Split-layout page — manages its own 3D canvas in the right sticky panel */}
        <main>
          {children}
        </main>
      </body>
    </html>
  )
}
