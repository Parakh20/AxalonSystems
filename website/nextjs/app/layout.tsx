import type { Metadata } from 'next'
import './globals.css'
import DynamicMainScene from '@/components/DynamicMainScene'
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
        {/* Full-screen immersive 3D world — scroll-driven, fixed behind everything */}
        <DynamicMainScene />

        {/* Custom teal cursor */}
        <DynamicCursor />

        {/* Navbar floats at z-index 100 */}
        <Navbar />

        {/* Scroll container with HTML overlays at z-index 1 */}
        <main style={{ position: 'relative', zIndex: 1 }}>
          {children}
        </main>
      </body>
    </html>
  )
}
