import { Scan, Zap, Shield, Hexagon, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

const features = [
  {
    icon: Zap,
    title: 'Autonomous Flight',
    desc: 'Fully autonomous mission planning and execution with intelligent path optimization and obstacle avoidance.',
    id: 'autonomous-flight',
    large: true,
  },
  {
    icon: Scan,
    title: 'LiDAR Mapping',
    desc: 'High-density 3D point cloud generation for terrain modeling, asset digitization, and anomaly detection.',
    id: 'lidar-mapping',
  },
  {
    icon: Shield,
    title: 'Telemetry Security',
    desc: 'End-to-end encrypted communication with AES-256 data protection for all mission and inspection data.',
    id: 'telemetry-security',
  },
  {
    icon: Hexagon,
    title: 'Onboard AI',
    desc: 'Edge-compute AI inference for real-time defect detection, classification, and automated reporting.',
    id: 'onboard-ai',
    large: true,
  },
  {
    icon: Activity,
    title: 'Modular Payload',
    desc: 'Hot-swappable sensor bays supporting LiDAR, RGB, thermal, and multispectral payloads.',
    id: 'modular-payload',
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 36 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

export default function FeaturesGrid() {
  return (
    <section
      id="features"
      data-testid="features-section"
      className="relative py-28 md:py-36 bg-[#0B0D10]"
    >
      <div className="relative max-w-7xl mx-auto px-6 md:px-12 lg:px-24">

        {/* Header */}
        <motion.div
          className="mb-16 flex items-end justify-between gap-8 border-b border-white/[0.06] pb-8"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}
        >
          <div>
            <motion.p variants={fadeUp} className="text-[11px] font-mono tracking-[0.28em] uppercase text-[#00D1B2] mb-3">
              01 — Capabilities
            </motion.p>
            <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-display font-medium tracking-tight text-white">
              Engineering precision<br className="hidden md:block" /> at every layer
            </motion.h2>
          </div>
          <motion.p variants={fadeUp} className="hidden md:block text-sm text-gray-500 max-w-xs text-right leading-relaxed">
            Five integrated modules, each precision-engineered for demanding inspection environments.
          </motion.p>
        </motion.div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/[0.04]">
          {/* Row 1: large (col-2) + small (col-1) */}
          {features.slice(0, 3).map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.id}
                data-testid={`feature-card-${f.id}`}
                className={`feature-card group relative bg-[#0B0D10] p-8 md:p-10 overflow-hidden ${f.large ? 'md:col-span-2' : ''}`}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.55, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ backgroundColor: '#0f1217' }}
              >
                {/* Corner accent (teal) on hover */}
                <div className="absolute top-0 left-0 w-0 h-px bg-[#00D1B2] group-hover:w-full transition-all duration-500" />

                <div className="flex flex-col h-full">
                  <motion.div
                    className="w-10 h-10 flex items-center justify-center bg-[#00D1B2]/10 mb-8"
                    whileHover={{ scale: 1.12, backgroundColor: 'rgba(0,209,178,0.18)' }}
                  >
                    <Icon className="w-5 h-5 text-[#00D1B2]" />
                  </motion.div>

                  <h3 className="text-lg font-display font-medium text-white mb-3">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-gray-500">{f.desc}</p>

                  {f.large && (
                    <div className="mt-auto pt-8">
                      <div className="h-px w-full bg-gradient-to-r from-[#00D1B2]/30 via-[#6EE7F9]/20 to-transparent" />
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}

          {/* Row 2: small (col-1) + large (col-2) */}
          {features.slice(3).map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.id}
                data-testid={`feature-card-${f.id}`}
                className={`feature-card group relative bg-[#0B0D10] p-8 md:p-10 overflow-hidden ${f.large ? 'md:col-span-2 md:order-last' : ''}`}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.55, delay: (i + 3) * 0.08, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ backgroundColor: '#0f1217' }}
              >
                <div className="absolute top-0 left-0 w-0 h-px bg-[#00D1B2] group-hover:w-full transition-all duration-500" />

                <div className="flex flex-col h-full">
                  <motion.div
                    className="w-10 h-10 flex items-center justify-center bg-[#00D1B2]/10 mb-8"
                    whileHover={{ scale: 1.12, backgroundColor: 'rgba(0,209,178,0.18)' }}
                  >
                    <Icon className="w-5 h-5 text-[#00D1B2]" />
                  </motion.div>

                  <h3 className="text-lg font-display font-medium text-white mb-3">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-gray-500">{f.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
