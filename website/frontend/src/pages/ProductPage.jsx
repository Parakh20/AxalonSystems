import { useEffect } from 'react';
import { Scan, Camera, Thermometer, Radio, Cpu, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import CTABanner from '../components/CTABanner';

const TECH_IMG = "https://images.unsplash.com/photo-1546425930-c93c758666dc?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

const payloadModules = [
  { icon: Scan,        label: 'LiDAR Module',      desc: 'High-density 3D point cloud, 300m range, 240k pts/sec',     color: '#00D1B2' },
  { icon: Camera,      label: 'RGB Camera',         desc: '48MP sensor, 4K/60fps video, mechanical stabilization',     color: '#6EE7F9' },
  { icon: Thermometer, label: 'Thermal Camera',     desc: '640×512 resolution, NETD <40mK, radiometric output',        color: '#FBBF24' },
  { icon: Radio,       label: 'RTK GPS Antenna',    desc: 'Multi-constellation GNSS, cm-level precision, PPK support', color: '#A78BFA' },
  { icon: Cpu,         label: 'AI Compute Module',  desc: 'Edge inference, 15 TOPS, real-time defect classification',  color: '#F472B6' },
];

const specs = [
  { label: 'Max Flight Time',  value: '45 min' },
  { label: 'Cruise Speed',     value: '12 m/s' },
  { label: 'Max Payload',      value: '2.4 kg' },
  { label: 'Operating Temp',   value: '-10 to 50°C' },
  { label: 'Wind Resistance',  value: '12 m/s' },
  { label: 'IP Rating',        value: 'IP54' },
  { label: 'Communication',    value: 'Encrypted 4G/5G + mesh' },
  { label: 'MTOW',             value: '7.2 kg' },
];

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
});

export default function ProductPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="bg-[#0B0D10] min-h-screen">
      <Navbar />

      {/* Hero */}
      <section data-testid="product-hero" className="pt-36 pb-24 px-6 md:px-12 lg:px-24">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <motion.p {...fadeUp(0)} className="text-[11px] font-mono tracking-[0.28em] uppercase text-[#00D1B2] mb-4">
                Product
              </motion.p>
              <motion.h1 {...fadeUp(0.1)} className="text-4xl sm:text-5xl lg:text-6xl font-display font-medium tracking-tight text-white leading-[1.06] mb-6">
                Modular by design.<br />Precise by default.
              </motion.h1>
              <motion.p {...fadeUp(0.2)} className="text-base md:text-lg leading-relaxed text-gray-400 max-w-lg">
                The Axalon UAS features a hot-swappable modular payload bay, allowing operators to configure sensor suites for any inspection mission.
              </motion.p>
            </div>
            <motion.div {...fadeUp(0.15)} className="relative">
              <div className="relative overflow-hidden bg-[#161A20] border border-white/[0.06]">
                <img
                  src={TECH_IMG}
                  alt="Axalon UAS technical hardware"
                  className="w-full h-[400px] object-cover"
                  style={{ filter: 'brightness(0.65) contrast(1.15)' }}
                />
                <div className="absolute inset-0 lidar-grid opacity-20" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#161A20] to-transparent" />
                {/* Corner accents */}
                <div className="absolute top-0 left-0 w-12 h-px bg-[#00D1B2]/60" />
                <div className="absolute top-0 left-0 w-px h-12 bg-[#00D1B2]/60" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Payload Modules */}
      <section id="payload" data-testid="payload-modules" className="py-28 md:py-36 bg-[#111318]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24">
          <motion.div {...fadeUp()} className="mb-16">
            <p className="text-[11px] font-mono tracking-[0.28em] uppercase text-[#00D1B2] mb-3">Payload Configuration</p>
            <h2 className="text-3xl md:text-4xl font-display font-medium tracking-tight text-white">Five integrated sensor modules</h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/[0.04]">
            {payloadModules.map((m, i) => {
              const Icon = m.icon;
              return (
                <motion.div
                  key={m.label}
                  data-testid={`module-${m.label.toLowerCase().replace(/\s/g, '-')}`}
                  className="group bg-[#111318] p-8 hover:bg-[#14181f] transition-colors duration-200"
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.5, delay: i * 0.07 }}
                  whileHover={{ y: -3 }}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 flex items-center justify-center shrink-0" style={{ backgroundColor: `${m.color}15` }}>
                      <Icon className="w-5 h-5" style={{ color: m.color }} />
                    </div>
                    <div>
                      <h3 className="text-base font-display font-medium text-white mb-2">{m.label}</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">{m.desc}</p>
                    </div>
                  </div>
                  <div className="mt-6 flex items-center gap-1 text-xs text-gray-600 group-hover:text-[#00D1B2] transition-colors duration-200">
                    <span>View specifications</span>
                    <ChevronRight className="w-3 h-3" />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Technical Specs */}
      <section id="specs" data-testid="tech-specs" className="py-28 md:py-36 bg-[#0B0D10]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            <motion.div {...fadeUp()}>
              <p className="text-[11px] font-mono tracking-[0.28em] uppercase text-[#00D1B2] mb-3">Technical Specifications</p>
              <h2 className="text-3xl md:text-4xl font-display font-medium tracking-tight text-white mb-6">Built for industrial conditions</h2>
              <p className="text-base leading-relaxed text-gray-400">
                Every component is engineered for reliability in harsh operating environments — from desert solar farms to high-altitude installations.
              </p>
            </motion.div>

            <div>
              {specs.map((s, i) => (
                <motion.div
                  key={s.label}
                  className="flex justify-between items-center py-4 border-b border-white/[0.05]"
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.45, delay: i * 0.05 }}
                >
                  <span className="text-sm text-gray-500">{s.label}</span>
                  <span className="text-sm font-display font-medium text-white">{s.value}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <CTABanner />
      <Footer />
    </div>
  );
}
