'use client'

import { useEffect } from 'react'
import { scrollStore } from '@/scrollStore'
import HeroOverlay from '@/components/UI/HeroOverlay'
import ThermalOverlay from '@/components/UI/ThermalOverlay'
import DetectionOverlay from '@/components/UI/DetectionOverlay'
import FleetOverlay from '@/components/UI/FleetOverlay'
import ReportOverlay from '@/components/UI/ReportOverlay'
import CTAOverlay from '@/components/UI/CTAOverlay'

// ── Section wrapper: height: 100vh, sticky content ──────────────────────────
function ScrollSection({
  children,
  id,
}: {
  children: React.ReactNode
  id?: string
}) {
  return (
    <section
      id={id}
      style={{ height: '100vh', position: 'relative' }}
    >
      <div style={{
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflow: 'hidden',
        pointerEvents: 'none',         // let scroll pass through 3D canvas
      }}>
        <div style={{ pointerEvents: 'auto' }}>
          {children}
        </div>
      </div>
    </section>
  )
}

// ── Root page ────────────────────────────────────────────────────────────────
export default function Home() {
  // Wire scroll position → scrollStore (zero re-renders)
  useEffect(() => {
    const update = () => {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      scrollStore.progress = window.scrollY / maxScroll
      scrollStore.raw = window.scrollY
    }
    window.addEventListener('scroll', update, { passive: true })
    update() // initialise
    return () => window.removeEventListener('scroll', update)
  }, [])

  return (
    // 6 scenes × 100vh = 600vh total scroll
    <div style={{ position: 'relative' }}>

      {/* ── SCENE 1: Hero ── scroll 0–100vh */}
      <ScrollSection id="hero">
        <HeroOverlay />
      </ScrollSection>

      {/* ── SCENE 2: Thermal Detection ── scroll 100–200vh */}
      <ScrollSection id="technology">
        <ThermalOverlay />
      </ScrollSection>

      {/* ── SCENE 3: RGB + AI Detection ── scroll 200–300vh */}
      <ScrollSection id="detection">
        <DetectionOverlay />
      </ScrollSection>

      {/* ── SCENE 4: Fleet / Scale ── scroll 300–400vh */}
      <ScrollSection id="fleet">
        <FleetOverlay />
      </ScrollSection>

      {/* ── SCENE 5: Report / Hologram ── scroll 400–500vh */}
      <ScrollSection id="report">
        <ReportOverlay />
      </ScrollSection>

      {/* ── SCENE 6: CTA ── scroll 500–600vh */}
      <ScrollSection id="contact">
        <CTAOverlay />
      </ScrollSection>

    </div>
  )
}
