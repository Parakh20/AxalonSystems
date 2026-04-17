'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

const links = ['Technology', 'Mission', 'Contact']

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        padding: '0 2rem',
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: scrolled
          ? 'rgba(5, 5, 8, 0.85)'
          : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled
          ? '1px solid rgba(0,240,200,0.08)'
          : '1px solid transparent',
        transition: 'background 0.3s ease, border-color 0.3s ease',
      }}
    >
      {/* Logo */}
      <motion.a
        href="#"
        style={{ textDecoration: 'none' }}
        whileHover={{ scale: 1.02 }}
      >
        <span
          style={{
            fontFamily: 'Syne, sans-serif',
            fontWeight: 800,
            fontSize: '1.1rem',
            letterSpacing: '0.12em',
            background: 'linear-gradient(135deg, #00f0c8 0%, #6c63ff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          AXALON SYSTEMS
        </span>
      </motion.a>

      {/* Nav links */}
      <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'center' }}>
        {links.map((link, i) => (
          <NavLink key={link} label={link} delay={i * 0.08} />
        ))}
        <motion.a
          href="#contact"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          style={{
            padding: '0.45rem 1.1rem',
            border: '1px solid rgba(0,240,200,0.4)',
            borderRadius: '4px',
            color: '#00f0c8',
            fontFamily: 'Space Grotesk, sans-serif',
            fontWeight: 500,
            fontSize: '0.82rem',
            letterSpacing: '0.06em',
            textDecoration: 'none',
            background: 'rgba(0,240,200,0.04)',
            transition: 'all 0.2s ease',
          }}
          whileHover={{
            background: 'rgba(0,240,200,0.1)',
            boxShadow: '0 0 20px rgba(0,240,200,0.2)',
          }}
        >
          REQUEST DEMO
        </motion.a>
      </div>
    </motion.nav>
  )
}

function NavLink({ label, delay }: { label: string; delay: number }) {
  const [hovered, setHovered] = useState(false)
  const href = `#${label.toLowerCase()}`

  return (
    <motion.a
      href={href}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 + delay, duration: 0.5 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      style={{
        position: 'relative',
        textDecoration: 'none',
        color: hovered ? '#e8e8f0' : '#6b6b80',
        fontFamily: 'Space Grotesk, sans-serif',
        fontWeight: 500,
        fontSize: '0.85rem',
        letterSpacing: '0.05em',
        transition: 'color 0.2s ease',
        paddingBottom: '2px',
      }}
    >
      {label}
      <motion.span
        style={{
          position: 'absolute',
          bottom: -2,
          left: 0,
          right: 0,
          height: '1px',
          background: 'linear-gradient(90deg, #00f0c8, #6c63ff)',
          transformOrigin: 'left',
        }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: hovered ? 1 : 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      />
    </motion.a>
  )
}
