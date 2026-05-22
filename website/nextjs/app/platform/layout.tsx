import type { Metadata } from 'next'
import './platform.css'

export const metadata: Metadata = {
  title: 'Axalon · Internal Inspection Console',
  description: 'Internal batch inspection console — restricted access.',
  robots: { index: false, follow: false },
}

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#f4f5f7',
        color: '#111827',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 48,
          padding: '0 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#ffffff',
          borderBottom: '1px solid #d6dbe3',
          zIndex: 100,
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span
            style={{
              padding: '4px 8px',
              borderRadius: 4,
              background: '#111827',
              color: '#ffffff',
              border: '1px solid #111827',
              fontWeight: 700,
            }}
          >
            INTERNAL
          </span>
          <span
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: '#111827',
            }}
          >
            Axalon Inspection Console
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: '#475569' }}>
          <span>BUILD 1.0.0</span>
          <span style={{ color: '#166534' }}>ONLINE</span>
        </div>
      </header>

      <div style={{ paddingTop: 48, height: '100%' }}>{children}</div>
    </div>
  )
}
