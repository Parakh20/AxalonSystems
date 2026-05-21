import { Link } from 'react-router-dom';
import { ArrowRight, Download } from 'lucide-react';
import { motion } from 'framer-motion';

const HERO_IMG = "https://images.unsplash.com/photo-1560800633-ce789bb8c91d?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400";
const DRONE_IMG = "https://images.unsplash.com/photo-1753781466384-cf5eee0a505d?crop=entropy&cs=srgb&fm=jpg&q=85&w=800";

const HEADLINE_WORDS = ["Autonomous", "inspection", "drones", "built", "for", "reliable", "industrial", "decisions."];

const stats = [
  { value: '99.7%', label: 'Detection accuracy' },
  { value: '10x', label: 'Faster than manual' },
  { value: '50MW+', label: 'Capacity inspected' },
];

export default function HeroSection() {
  return (
    <section
      data-testid="hero-section"
      className="relative min-h-screen flex items-center overflow-hidden bg-[#0B0D10]"
    >
      {/* Radial glow top-right */}
      <div className="absolute top-0 right-0 w-[900px] h-[700px] bg-[#00D1B2]/[0.045] rounded-full blur-[220px] pointer-events-none" />
      {/* Subtle grid */}
      <div className="absolute inset-0 lidar-grid opacity-[0.06] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 lg:px-24 pt-36 pb-24 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_520px] gap-16 items-center">

          {/* ── Left: content ── */}
          <div>
            {/* Eyebrow */}
            <motion.div
              className="flex items-center gap-3 mb-10"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              <span className="w-8 h-px bg-[#00D1B2] block" />
              <span className="text-[11px] font-mono tracking-[0.28em] uppercase text-[#00D1B2]">
                Autonomous Inspection Platform
              </span>
            </motion.div>

            {/* Headline — word by word reveal */}
            <h1 className="text-[clamp(2.8rem,6vw,5rem)] font-display font-medium tracking-tight text-white leading-[1.06] mb-8">
              {HEADLINE_WORDS.map((word, i) => (
                <span key={i} className="inline-block mr-[0.28em] overflow-hidden">
                  <motion.span
                    className="inline-block"
                    initial={{ y: '105%', opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{
                      duration: 0.6,
                      delay: 0.3 + i * 0.06,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    {word}
                  </motion.span>
                </span>
              ))}
            </h1>

            {/* Subtitle */}
            <motion.p
              className="text-base md:text-lg leading-relaxed text-gray-400 mb-10 max-w-[520px]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.0 }}
            >
              AI-enabled, modular UAS for precise data capture and automated reporting — starting with solar asset inspections.
            </motion.p>

            {/* CTAs */}
            <motion.div
              className="flex flex-wrap gap-4 mb-16"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.2 }}
            >
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Link
                  to="/contact"
                  data-testid="hero-cta-demo"
                  className="inline-flex items-center gap-2 bg-[#00D1B2] text-[#0B0D10] px-7 py-3.5 text-sm font-medium rounded-sm hover:bg-[#6EE7F9] transition-colors duration-200 shadow-[0_0_24px_rgba(0,209,178,0.25)]"
                >
                  Contact us
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <a
                  href="#features"
                  data-testid="hero-cta-datasheet"
                  className="inline-flex items-center gap-2 bg-white/5 text-white border border-white/10 px-7 py-3.5 text-sm font-medium rounded-sm hover:bg-white/10 hover:border-white/20 transition-all duration-200"
                >
                  <Download className="w-4 h-4" />
                  Download datasheet
                </a>
              </motion.div>
            </motion.div>

            {/* Stats row */}
            <motion.div
              className="flex gap-10 pt-8 border-t border-white/[0.07]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 1.5 }}
            >
              {stats.map((s) => (
                <div key={s.label}>
                  <p className="text-2xl md:text-3xl font-display font-medium text-white">{s.value}</p>
                  <p className="text-[11px] tracking-wider uppercase text-gray-500 mt-1">{s.label}</p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* ── Right: visual card ── */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="hidden lg:block"
          >
            <div className="relative">
              {/* Main image card */}
              <div className="relative overflow-hidden border border-white/[0.08] bg-[#111318]">
                <img
                  src={DRONE_IMG}
                  alt="Axalon inspection drone"
                  className="w-full h-[420px] object-cover"
                  style={{ filter: 'brightness(0.65) contrast(1.15)' }}
                />
                {/* Grid overlay */}
                <div className="absolute inset-0 lidar-grid opacity-25" />
                {/* Bottom fade */}
                <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#111318] to-transparent" />

                {/* Top-left badge */}
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-[#0B0D10]/80 backdrop-blur-sm px-3 py-1.5 border border-white/[0.08]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00D1B2] pulse-dot" />
                  <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-[#00D1B2]">Live telemetry</span>
                </div>

                {/* Bottom-right annotation */}
                <div className="absolute bottom-4 right-4 text-right">
                  <p className="text-[10px] font-mono text-[#00D1B2]/60 tracking-wider uppercase">ALT 35M · SPEED 9.4M/S</p>
                  <p className="text-[10px] font-mono text-white/30 tracking-wider">18°55′N · 72°49′E</p>
                </div>
              </div>

              {/* Floating stat pill */}
              <motion.div
                className="absolute -bottom-5 -left-5 bg-[#161A20] border border-white/[0.08] px-5 py-3 shadow-xl"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 1.2 }}
              >
                <p className="text-xl font-display font-medium text-white">847</p>
                <p className="text-[10px] tracking-wider uppercase text-gray-500 mt-0.5">Anomalies detected</p>
              </motion.div>

              {/* Teal corner accent */}
              <div className="absolute -top-px -right-px w-16 h-px bg-[#00D1B2]/60" />
              <div className="absolute -top-px -right-px w-px h-16 bg-[#00D1B2]/60" />
            </div>
          </motion.div>

        </div>
      </div>

      {/* Bottom edge annotation */}
      <motion.div
        className="absolute bottom-6 right-6 hidden lg:flex items-center gap-2 text-[#00D1B2]/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#00D1B2]/40 pulse-dot" />
        <span className="text-[10px] font-mono tracking-[0.15em] uppercase">Axalon · v2.4.1</span>
      </motion.div>
    </section>
  );
}
