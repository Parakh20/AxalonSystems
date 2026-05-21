import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export default function CTABanner() {
  return (
    <section data-testid="cta-banner" className="relative py-28 md:py-36 bg-[#0B0D10] overflow-hidden">
      {/* Large radial glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[800px] h-[400px] bg-[#00D1B2]/[0.05] rounded-full blur-[180px]" />
      </div>

      {/* Top border accent */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-px bg-gradient-to-r from-transparent via-[#00D1B2]/30 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6 md:px-12 lg:px-24">
        <div className="max-w-3xl mx-auto text-center">

          <motion.p
            className="text-[11px] font-mono tracking-[0.28em] uppercase text-[#00D1B2] mb-6"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            Ready to transform inspections?
          </motion.p>

          <motion.h2
            className="text-3xl md:text-5xl lg:text-6xl font-display font-medium tracking-tight text-white mb-6 leading-[1.05]"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            See Axalon in action<br className="hidden md:block" /> on your solar assets
          </motion.h2>

          <motion.p
            className="text-base leading-relaxed text-gray-400 mb-12 max-w-lg mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Get in touch with our team to learn about autonomous flight, real-time AI processing, and automated reporting.
          </motion.p>

          <motion.div
            className="flex flex-wrap gap-4 justify-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link
                to="/contact"
                data-testid="cta-demo-button"
                className="inline-flex items-center gap-2 bg-[#00D1B2] text-[#0B0D10] px-8 py-4 text-sm font-medium rounded-sm hover:bg-[#6EE7F9] transition-colors duration-200 shadow-[0_0_30px_rgba(0,209,178,0.2)]"
              >
                Contact us
                <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link
                to="/product"
                data-testid="cta-product-button"
                className="inline-flex items-center gap-2 bg-white/5 text-white border border-white/10 px-8 py-4 text-sm font-medium rounded-sm hover:bg-white/10 hover:border-white/20 transition-all duration-200"
              >
                View product specs
              </Link>
            </motion.div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
