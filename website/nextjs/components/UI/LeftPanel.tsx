'use client'

// Step 2: structural placeholder — section labels confirm layout is working.
// Step 3 will replace each section with full rich content from the overlay components.

const C = {
  teal:  '#00f0c8',
  text:  '#e8e8f0',
  muted: '#6b6b80',
}

const SECTIONS = [
  { num: '01', label: 'Autonomous Inspection', id: 'hero'      },
  { num: '02', label: 'Thermal Intelligence',  id: 'thermal'   },
  { num: '03', label: 'Dual-Sensor Fusion',    id: 'detection' },
  { num: '04', label: 'Full-Site Coverage',    id: 'fleet'     },
  { num: '05', label: 'Instant Reports',       id: 'report'    },
  { num: '06', label: 'Ready to Inspect?',     id: 'contact'   },
]

const sectionStyle: React.CSSProperties = {
  minHeight: '100vh',
  padding: '5rem 3rem 5rem 5rem',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  position: 'relative',
  borderTop: '1px solid rgba(255,255,255,0.04)',
}

export default function LeftPanel() {
  return (
    <div>
      {SECTIONS.map(({ num, label, id }) => (
        <section key={id} id={id} data-section={id} style={sectionStyle}>
          <p style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: '0.65rem',
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: C.teal,
            marginBottom: '1.5rem',
          }}>
            {num} — {label}
          </p>
          <h2 style={{
            fontFamily: 'Syne, sans-serif',
            fontWeight: 800,
            fontSize: 'clamp(1.8rem, 3.5vw, 3rem)',
            color: C.text,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            marginBottom: '1rem',
          }}>
            {label}
          </h2>
          <p style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: '0.9rem',
            color: C.muted,
            lineHeight: 1.7,
            maxWidth: '380px',
          }}>
            Section {num} content — rich overlay text loads in Step 3.
          </p>
        </section>
      ))}
    </div>
  )
}
