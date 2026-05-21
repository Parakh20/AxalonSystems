import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

const stats = [
  { value: 99.7, suffix: '%', label: 'Defect detection rate', display: '99.7%' },
  { value: 3,    suffix: 'x', label: 'Faster than manual',    display: '3x' },
  { value: 50,   suffix: 'MW+', label: 'Solar capacity inspected', display: '50MW+' },
  { value: 2,    suffix: 'hr', label: 'From flight to report',  display: '<2hr', prefix: '<' },
];

function StatItem({ stat, index }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <motion.div
      ref={ref}
      className="text-center md:text-left px-8 first:pl-0 last:pr-0"
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      <motion.p
        className="text-3xl md:text-4xl font-display font-medium text-white mb-2"
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.4, delay: 0.1 + index * 0.1 }}
      >
        {stat.display}
      </motion.p>
      <p className="text-[11px] tracking-[0.18em] uppercase text-gray-500">{stat.label}</p>
    </motion.div>
  );
}

export default function TrustStrip() {
  return (
    <section data-testid="trust-strip" className="py-16 bg-[#0B0D10] border-y border-white/[0.05]">
      <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-white/[0.05]">
          {stats.map((s, i) => (
            <StatItem key={s.label} stat={s} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
