'use client'

import { useEffect, useRef } from 'react'
import { scrollStore } from '@/scrollStore'
import DynamicMainScene from '@/components/DynamicMainScene'
import LeftPanel from '@/components/UI/LeftPanel'

// ─── Design tokens (mirrors LeftPanel) ───────────────────────────────────────
const C = {
  teal: '#00f0c8',
  purple: '#6c63ff',
  text: '#e8e8f0',
  muted: '#6b6b80',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem 1rem',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '4px',
  color: C.text,
  fontFamily: 'Space Grotesk, sans-serif',
  fontSize: '0.88rem',
  outline: 'none',
  marginBottom: '0.75rem',
  display: 'block',
}

// ─── Hero content (full-width, overlay on canvas) ────────────────────────────
function HeroContent() {
  return (
    <section
      id="hero"
      className="layout-hero"
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 4rem',
      }}
    >
      <p style={{
        fontFamily: 'Space Grotesk, sans-serif',
        fontSize: '0.65rem',
        fontWeight: 500,
        letterSpacing: '0.28em',
        textTransform: 'uppercase',
        color: C.teal,
        marginBottom: '1.6rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        <span style={{ width: '22px', height: '1px', background: C.teal }} />
        01 — Autonomous Inspection Platform
        <span style={{ width: '22px', height: '1px', background: C.teal }} />
      </p>

      <h1 style={{
        fontFamily: 'Syne, sans-serif',
        fontWeight: 800,
        fontSize: 'clamp(2.8rem, 5.5vw, 5rem)',
        lineHeight: 0.95,
        color: C.text,
        letterSpacing: '-0.03em',
        marginBottom: '1.5rem',
        maxWidth: '900px',
      }}>
        Autonomous inspection<br />
        drones built for<br />
        <span style={{
          background: `linear-gradient(135deg, ${C.teal} 0%, ${C.purple} 100%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          reliable industrial decisions.
        </span>
      </h1>

      <p style={{
        fontFamily: 'Space Grotesk, sans-serif',
        fontSize: '1rem',
        color: C.muted,
        lineHeight: 1.75,
        marginBottom: '2.5rem',
        maxWidth: '480px',
      }}>
        AI-enabled drone systems for precise solar asset inspection.
        Thermal + RGB fusion · 11-class fault detection · Real-time reports.
      </p>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '3rem' }}>
        <button style={{
          padding: '0.8rem 2rem',
          background: `linear-gradient(135deg, ${C.teal} 0%, ${C.purple} 100%)`,
          border: 'none',
          borderRadius: '4px',
          color: '#020208',
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 700,
          fontSize: '0.85rem',
          letterSpacing: '0.06em',
          cursor: 'pointer',
          boxShadow: '0 0 24px rgba(0,240,200,0.28)',
        }}>
          See Technology →
        </button>
        <button style={{
          padding: '0.8rem 2rem',
          background: 'transparent',
          border: `1px solid rgba(0,240,200,0.3)`,
          borderRadius: '4px',
          color: C.teal,
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 600,
          fontSize: '0.85rem',
          letterSpacing: '0.06em',
          cursor: 'pointer',
        }}>
          Request Demo
        </button>
      </div>

      <div style={{ display: 'flex', gap: '3rem' }}>
        {[
          { v: '99.7%', l: 'ACCURACY' },
          { v: '10x', l: 'FASTER' },
          { v: '50MW+', l: 'INSPECTED' },
        ].map(({ v, l }) => (
          <div key={l} style={{ textAlign: 'center' }}>
            <p style={{
              fontFamily: 'Syne, sans-serif',
              fontWeight: 800,
              fontSize: '1.6rem',
              background: `linear-gradient(135deg, ${C.teal}, ${C.purple})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              lineHeight: 1,
              marginBottom: '0.2rem',
            }}>{v}</p>
            <p style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: '0.58rem',
              letterSpacing: '0.18em',
              color: C.muted,
            }}>{l}</p>
          </div>
        ))}
      </div>

      {/* Telemetry badge */}
      <div style={{
        position: 'absolute',
        bottom: '2.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        background: 'rgba(0,240,200,0.06)',
        border: '1px solid rgba(0,240,200,0.15)',
        borderRadius: '100px',
        padding: '0.4rem 1rem',
      }}>
        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: C.teal, boxShadow: '0 0 6px rgba(0,240,200,0.8)' }} />
        <span style={{ fontFamily: 'Space Grotesk, monospace', fontSize: '0.6rem', color: C.teal, letterSpacing: '0.1em' }}>
          ALT 35M · 9.4M/S · 18°55′N 72°49′E
        </span>
      </div>
    </section>
  )
}

// ─── CTA content (full-width, overlay on canvas) ─────────────────────────────
function CTAContent() {
  return (
    <section
      id="cta-section"
      className="layout-cta"
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '5rem',
        padding: '0 6rem',
      }}
    >
      {/* Left: headline */}
      <div style={{ flex: 1 }}>
        <p style={{
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: '0.65rem',
          fontWeight: 500,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: C.teal,
          marginBottom: '1.4rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span style={{ width: '22px', height: '1px', background: C.teal }} />
          06 — Ready to inspect?
        </p>

        <h2 style={{
          fontFamily: 'Syne, sans-serif',
          fontWeight: 800,
          fontSize: 'clamp(2.5rem, 4vw, 4rem)',
          lineHeight: 1,
          color: C.text,
          letterSpacing: '-0.03em',
          marginBottom: '1.2rem',
        }}>
          Request a<br />
          <span style={{
            background: `linear-gradient(135deg, ${C.teal} 0%, ${C.purple} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>demo flight.</span>
        </h2>

        <p style={{
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: '0.95rem',
          color: C.muted,
          lineHeight: 1.75,
          maxWidth: '340px',
          marginBottom: '2rem',
        }}>
          Let us inspect your solar farm — no commitment.
          Full fault report within 48 hours of the flight.
        </p>

        <div style={{ display: 'flex', gap: '2.5rem' }}>
          {[
            { v: '99.7%', l: 'Detection accuracy' },
            { v: '10x', l: 'Faster than manual' },
            { v: '50MW+', l: 'Sites inspected' },
          ].map(({ v, l }) => (
            <div key={l}>
              <p style={{
                fontFamily: 'Syne, sans-serif',
                fontWeight: 800,
                fontSize: '1.5rem',
                background: `linear-gradient(135deg, ${C.teal}, ${C.purple})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                lineHeight: 1,
                marginBottom: '0.2rem',
              }}>{v}</p>
              <p style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: '0.58rem',
                color: C.muted,
                letterSpacing: '0.06em',
              }}>{l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right: form card */}
      <div style={{
        width: '420px',
        flexShrink: 0,
        background: 'rgba(13,13,20,0.85)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(0,240,200,0.1)',
        borderRadius: '8px',
        padding: '2rem',
      }}>
        <p style={{
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: '0.6rem',
          letterSpacing: '0.2em',
          color: C.muted,
          textTransform: 'uppercase',
          marginBottom: '1.5rem',
        }}>Get in touch</p>

        <input style={inputStyle} placeholder="Full name" />
        <input style={inputStyle} placeholder="Work email" />
        <input style={inputStyle} placeholder="Company / solar farm name" />
        <textarea
          style={{ ...inputStyle, resize: 'none', lineHeight: 1.6, marginBottom: '0' }}
          placeholder="Site size, location, or any questions..."
          rows={4}
        />

        <button style={{
          width: '100%',
          marginTop: '1rem',
          padding: '0.8rem 1.5rem',
          background: `linear-gradient(135deg, ${C.teal} 0%, ${C.purple} 100%)`,
          border: 'none',
          borderRadius: '4px',
          color: '#020208',
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 700,
          fontSize: '0.82rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          boxShadow: '0 0 24px rgba(0,240,200,0.28)',
        }}>
          Request demo flight →
        </button>

        <p style={{
          textAlign: 'center',
          marginTop: '1rem',
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: '0.75rem',
          color: C.muted,
        }}>
          Or email us at{' '}
          <a href="mailto:contact@axalonsystems.com" style={{ color: C.teal, textDecoration: 'none' }}>
            contact@axalonsystems.com
          </a>
        </p>
      </div>
    </section>
  )
}

// ─── Page root ────────────────────────────────────────────────────────────────
export default function Home() {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const splitLineRef = useRef<HTMLDivElement>(null)
  const leftInnerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // ── Split-line flash: appears at center, slides to 40%, fades out ─────────
    const fireSplitLine = () => {
      const line = splitLineRef.current
      if (!line) return
      // Phase 1: snap to center, appear instantly
      line.style.transition = 'none'
      line.style.left = '50%'
      line.style.opacity = '1'
      // Phase 2: slide to split point (requestAnimationFrame lets the snap settle first)
      requestAnimationFrame(() => {
        line.style.transition = 'left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        line.style.left = '40%'
      })
      // Phase 3: fade out after slide completes
      setTimeout(() => {
        line.style.transition = 'opacity 0.3s ease'
        line.style.opacity = '0'
      }, 600)
    }

    const update = () => {
      const scrollY = window.scrollY
      const vh = window.innerHeight
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh)
      const wrapper = wrapperRef.current

      // Wire scrollStore for 3D scene
      scrollStore.progress = scrollY / maxScroll
      scrollStore.raw = scrollY

      // ── Layout state machine ──────────────────────────────────────────────
      if (wrapper) {
        const wasHero = !wrapper.classList.contains('split-active') && !wrapper.classList.contains('cta-active')

        if (scrollY > vh * 5.2) {
          // CTA zone
          wrapper.classList.add('cta-active')
          wrapper.classList.remove('split-active')
        } else if (scrollY > vh * 0.8) {
          // Split zone — fire line animation only on first entry from hero
          if (wasHero) fireSplitLine()
          wrapper.classList.add('split-active')
          wrapper.classList.remove('cta-active')
        } else {
          // Hero zone — reset line
          const line = splitLineRef.current
          if (line) { line.style.opacity = '0'; line.style.left = '50%' }
          wrapper.classList.remove('split-active', 'cta-active')
        }
      }

      // ── Sync left panel translateY with main scroll ───────────────────────
      // Split zone spans 100vh → 500vh; left panel has 4 sections × 100vh = 400vh content
      const splitStart = vh
      const splitEnd = vh * 5
      if (leftInnerRef.current) {
        const clamped = Math.max(0, Math.min(scrollY - splitStart, splitEnd - splitStart))
        leftInnerRef.current.style.transform = `translateY(-${clamped}px)`
      }
    }

    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => window.removeEventListener('scroll', update)
  }, [])

  return (
    <div id="main-wrapper" ref={wrapperRef}>

      {/* ── Fixed canvas panel (right) ── */}
      <div id="right-panel">
        <DynamicMainScene />
      </div>

      {/* ── Fixed left content panel ── */}
      <div id="left-panel">
        {/* leftInnerRef enables scroll-driven translateY */}
        <div ref={leftInnerRef}>
          <LeftPanel />
        </div>
      </div>

      {/* ── Split-line flash (animated in Step 4) ── */}
      <div id="split-line" ref={splitLineRef} />

      {/* ── Scroll container: provides page height + positions hero/CTA overlays ── */}
      <div style={{ height: '700vh', position: 'relative' }}>

        {/* Zone 1 — Hero (0–100vh) */}
        <HeroContent />

        {/* Zone 2 — Split middle (100vh–500vh): left panel slides in, canvas narrows */}
        <div style={{ height: '400vh' }} />

        {/* Zone 3 — CTA (600vh–700vh) */}
        <CTAContent />

      </div>
    </div>
  )
}
