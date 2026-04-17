import { MapPin, Cpu, FileText } from 'lucide-react';
import { motion } from 'framer-motion';

const steps = [
  {
    num: '01',
    icon: MapPin,
    title: 'Plan the mission',
    desc: 'Define inspection boundaries and parameters. The system auto-generates optimized flight paths with full terrain awareness.',
    id: 'step-plan',
  },
  {
    num: '02',
    icon: Cpu,
    title: 'Autonomous capture',
    desc: 'Deploy the drone for fully autonomous data collection. LiDAR, RGB, and thermal sensors capture synchronized multi-layer datasets.',
    id: 'step-capture',
  },
  {
    num: '03',
    icon: FileText,
    title: 'AI-powered report',
    desc: 'Onboard AI processes data in real-time. Receive automated inspection reports with detected anomalies, severity classification, and GPS-tagged findings.',
    id: 'step-report',
  },
];

export default function HowItWorks() {
  return (
    <section
      data-testid="how-it-works-section"
      className="relative py-28 md:py-36 bg-[#111318] overflow-hidden"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-px bg-gradient-to-r from-transparent via-[#00D1B2]/20 to-transparent" />

      <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24">

        <motion.div
          className="mb-20"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-[11px] font-mono tracking-[0.28em] uppercase text-[#00D1B2] mb-3">
            02 — How it works
          </p>
          <h2 className="text-3xl md:text-4xl font-display font-medium tracking-tight text-white">
            From deployment to decisions<br className="hidden md:block" /> in minutes
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-t border-white/[0.05]">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.id}
                data-testid={step.id}
                className="relative border-b md:border-b-0 md:border-r border-white/[0.05] last:border-r-0"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.6, delay: i * 0.14, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="p-8 md:p-10">
                  {/* Number + icon row */}
                  <div className="flex items-center gap-4 mb-8">
                    <span className="text-[3rem] font-display font-medium text-[#00D1B2]/15 leading-none select-none tabular-nums">
                      {step.num}
                    </span>
                    <div className="w-px h-10 bg-white/[0.07]" />
                    <div className="w-8 h-8 flex items-center justify-center bg-[#00D1B2]/10">
                      <Icon className="w-4 h-4 text-[#00D1B2]" />
                    </div>
                  </div>

                  <h3 className="text-lg font-display font-medium text-white mb-3">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-gray-500">{step.desc}</p>
                </div>

                {/* Teal top accent line on hover */}
                <motion.div
                  className="absolute top-0 left-0 h-px bg-[#00D1B2]"
                  initial={{ width: 0 }}
                  whileInView={{ width: '40%' }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.3 + i * 0.14 }}
                />
              </motion.div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
