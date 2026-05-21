'use client'

import { useEffect, useRef, useState } from 'react'
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
function HeroContent({ isMobile = false }: { isMobile?: boolean }) {
  return (
    <section
      id="hero"
      className="layout-hero"
      style={{
        minHeight: isMobile ? '100svh' : '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: isMobile ? '7rem 1.25rem 3rem' : '0 4rem',
      }}
    >
      <p style={{
        fontFamily: 'Space Grotesk, sans-serif',
        fontSize: isMobile ? '0.58rem' : '0.65rem',
        fontWeight: 500,
        letterSpacing: isMobile ? '0.18em' : '0.28em',
        textTransform: 'uppercase',
        color: C.teal,
        marginBottom: isMobile ? '1.2rem' : '1.6rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        <span style={{ width: isMobile ? '16px' : '22px', height: '1px', background: C.teal }} />
        01 — Autonomous Inspection Platform
        <span style={{ width: isMobile ? '16px' : '22px', height: '1px', background: C.teal }} />
      </p>

      <h1 style={{
        fontFamily: 'Syne, sans-serif',
        fontWeight: 800,
        fontSize: isMobile ? 'clamp(2.35rem, 11vw, 3.2rem)' : 'clamp(2.8rem, 5.5vw, 5rem)',
        lineHeight: isMobile ? 1 : 0.95,
        color: C.text,
        letterSpacing: '-0.03em',
        marginBottom: isMobile ? '1.1rem' : '1.5rem',
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
        fontSize: isMobile ? '0.92rem' : '1rem',
        color: C.muted,
        lineHeight: isMobile ? 1.65 : 1.75,
        marginBottom: isMobile ? '1.8rem' : '2.5rem',
        maxWidth: isMobile ? '32rem' : '480px',
      }}>
        AI-enabled drone systems for precise solar asset inspection.
        Thermal + RGB fusion · 11-class fault detection · Real-time reports.
      </p>

      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: isMobile ? '2rem' : '3rem',
        flexDirection: isMobile ? 'column' : 'row',
        width: isMobile ? '100%' : 'auto',
        maxWidth: isMobile ? '24rem' : 'none',
      }}>
        <button style={{
          padding: isMobile ? '0.95rem 1.4rem' : '0.8rem 2rem',
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
          width: isMobile ? '100%' : 'auto',
        }}>
          See Technology →
        </button>
        <button style={{
          padding: isMobile ? '0.95rem 1.4rem' : '0.8rem 2rem',
          background: 'transparent',
          border: `1px solid rgba(0,240,200,0.3)`,
          borderRadius: '4px',
          color: C.teal,
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 600,
          fontSize: '0.85rem',
          letterSpacing: '0.06em',
          cursor: 'pointer',
          width: isMobile ? '100%' : 'auto',
        }}>
          Request Demo
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))',
        gap: isMobile ? '1rem' : '3rem',
        width: isMobile ? '100%' : 'auto',
        maxWidth: isMobile ? '26rem' : 'none',
      }}>
        {[
          { v: '99.7%', l: 'ACCURACY' },
          { v: '10x', l: 'FASTER' },
          { v: '50MW+', l: 'INSPECTED' },
        ].map(({ v, l }) => (
          <div
            key={l}
            style={{
              textAlign: 'center',
              gridColumn: isMobile && l === 'INSPECTED' ? '1 / -1' : 'auto',
            }}
          >
            <p style={{
              fontFamily: 'Syne, sans-serif',
              fontWeight: 800,
              fontSize: isMobile ? '1.35rem' : '1.6rem',
              background: `linear-gradient(135deg, ${C.teal}, ${C.purple})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              lineHeight: 1,
              marginBottom: '0.2rem',
            }}>{v}</p>
            <p style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: isMobile ? '0.52rem' : '0.58rem',
              letterSpacing: isMobile ? '0.14em' : '0.18em',
              color: C.muted,
            }}>{l}</p>
          </div>
        ))}
      </div>

      {/* Telemetry badge */}
      <div style={{
        position: 'absolute',
        bottom: isMobile ? '1.25rem' : '2.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        background: 'rgba(0,240,200,0.06)',
        border: '1px solid rgba(0,240,200,0.15)',
        borderRadius: '100px',
        padding: isMobile ? '0.35rem 0.8rem' : '0.4rem 1rem',
        maxWidth: 'calc(100vw - 2rem)',
      }}>
        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: C.teal, boxShadow: '0 0 6px rgba(0,240,200,0.8)' }} />
        <span style={{
          fontFamily: 'Space Grotesk, monospace',
          fontSize: isMobile ? '0.52rem' : '0.6rem',
          color: C.teal,
          letterSpacing: isMobile ? '0.06em' : '0.1em',
          whiteSpace: 'nowrap',
        }}>
          ALT 35M · 9.4M/S · 18°55′N 72°49′E
        </span>
      </div>
    </section>
  )
}

// ─── CTA content (full-width, overlay on canvas) ─────────────────────────────
function CTAContent({ isMobile = false }: { isMobile?: boolean }) {
  return (
    <section
      id="cta-section"
      className="layout-cta"
      style={{
        minHeight: isMobile ? 'auto' : '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: isMobile ? '2rem' : '5rem',
        padding: isMobile ? '4rem 1.25rem 5rem' : '0 6rem',
        flexDirection: isMobile ? 'column' : 'row',
      }}
    >
      {/* Left: headline */}
      <div style={{ flex: 1, width: '100%', maxWidth: isMobile ? '34rem' : 'none' }}>
        <p style={{
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: isMobile ? '0.58rem' : '0.65rem',
          fontWeight: 500,
          letterSpacing: isMobile ? '0.18em' : '0.28em',
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
          fontSize: isMobile ? 'clamp(2rem, 10vw, 2.8rem)' : 'clamp(2.5rem, 4vw, 4rem)',
          lineHeight: isMobile ? 1.05 : 1,
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
          fontSize: isMobile ? '0.9rem' : '0.95rem',
          color: C.muted,
          lineHeight: isMobile ? 1.65 : 1.75,
          maxWidth: '340px',
          marginBottom: '2rem',
        }}>
          Let us inspect your solar farm — no commitment.
          Full fault report within 48 hours of the flight.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))',
          gap: isMobile ? '1rem' : '2.5rem',
        }}>
          {[
            { v: '99.7%', l: 'Detection accuracy' },
            { v: '10x', l: 'Faster than manual' },
            { v: '50MW+', l: 'Sites inspected' },
          ].map(({ v, l }) => (
            <div key={l} style={{ gridColumn: isMobile && l === 'Sites inspected' ? '1 / -1' : 'auto' }}>
              <p style={{
                fontFamily: 'Syne, sans-serif',
                fontWeight: 800,
                fontSize: isMobile ? '1.3rem' : '1.5rem',
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
        width: isMobile ? '100%' : '420px',
        maxWidth: isMobile ? '34rem' : '420px',
        flexShrink: 0,
        background: 'rgba(13,13,20,0.85)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(0,240,200,0.1)',
        borderRadius: '8px',
        padding: isMobile ? '1.35rem' : '2rem',
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
  const progressFillRef = useRef<HTMLDivElement>(null)
  const progressDotRef = useRef<HTMLDivElement>(null)
  const progressLabelRef = useRef<HTMLSpanElement>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 900)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (isMobile) {
      const wrapper = wrapperRef.current
      if (wrapper) wrapper.classList.remove('split-active', 'cta-active')
      return
    }

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

      // ── Progress bar ─────────────────────────────────────────────────────
      const pct = scrollY / maxScroll
      if (progressFillRef.current) progressFillRef.current.style.height = `${pct * 100}vh`
      if (progressDotRef.current) progressDotRef.current.style.top = `${pct * 100}vh`
      if (progressLabelRef.current) {
        const section = Math.min(6, Math.floor(pct * 7) + 1)
        progressLabelRef.current.textContent = String(section).padStart(2, '0')
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
  }, [isMobile])

  return (
    <div
      id="main-wrapper"
      ref={wrapperRef}
      className={isMobile ? 'mobile-layout' : undefined}
    >

      {/* ── Fixed canvas panel (right) ── */}
      <div id="right-panel">
        <DynamicMainScene />
      </div>

      {/* ── Fixed left content panel ── */}
      {!isMobile && (
        <div id="left-panel">
          {/* leftInnerRef enables scroll-driven translateY */}
          <div ref={leftInnerRef}>
            <LeftPanel />
          </div>
        </div>
      )}

      {/* ── Split-line flash ── */}
      {!isMobile && <div id="split-line" ref={splitLineRef} />}

      {/* ── Scroll progress bar (far left edge) ── */}
      {!isMobile && (
        <div style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: '2px',
          height: '100vh',
          background: 'rgba(255,255,255,0.05)',
          zIndex: 100,
          pointerEvents: 'none',
        }}>
          {/* Gradient fill */}
          <div
            ref={progressFillRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '0vh',
              background: 'linear-gradient(to bottom, #00f0c8, #6c63ff)',
            }}
          />
          {/* Moving dot + section label */}
          <div
            ref={progressDotRef}
            style={{
              position: 'absolute',
              top: '0vh',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#00f0c8',
              boxShadow: '0 0 8px rgba(0,240,200,0.9)',
              flexShrink: 0,
            }} />
            <span
              ref={progressLabelRef}
              style={{
                fontFamily: 'Space Grotesk, monospace',
                fontSize: '0.55rem',
                letterSpacing: '0.1em',
                color: 'rgba(0,240,200,0.7)',
              }}
            >01</span>
          </div>
        </div>
      )}

      {/* ── Scroll container: provides page height + positions hero/CTA overlays ── */}
      <div style={{ height: isMobile ? 'auto' : '700vh', position: 'relative' }}>

        {/* Zone 1 — Hero (0–100vh) */}
        <HeroContent isMobile={isMobile} />

        {/* Zone 2 — Split middle (100vh–500vh): left panel slides in, canvas narrows */}
        {isMobile ? (
          <div id="mobile-content-flow">
            <LeftPanel />
          </div>
        ) : (
          <div style={{ height: '400vh' }} />
        )}

        {/* Zone 3 — CTA (600vh–700vh) */}
        <CTAContent isMobile={isMobile} />

      </div>
    </div>
  )
}
