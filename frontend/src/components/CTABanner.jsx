import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export default function CTABanner() {
  return (
    <section data-testid="cta-banner" className="relative py-24 md:py-32 bg-[#0B0D10] overflow-hidden">
      {/* Subtle glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#00D1B2]/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6 md:px-12 lg:px-24 text-center">
        <p className="text-sm tracking-[0.2em] uppercase text-[#00D1B2] font-medium mb-6">
          Ready to transform inspections?
        </p>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-display font-medium tracking-tight text-white mb-6 max-w-3xl mx-auto">
          See Axalon in action on your solar assets
        </h2>
        <p className="text-base leading-relaxed text-gray-400 mb-10 max-w-lg mx-auto">
          Schedule a personalized demo with our team. We'll walk through autonomous flight, real-time AI processing, and automated reporting.
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <Link
            to="/contact"
            data-testid="cta-demo-button"
            className="inline-flex items-center gap-2 bg-[#00D1B2] text-[#0B0D10] px-8 py-4 text-sm font-medium rounded-sm hover:bg-[#6EE7F9] transition-all duration-300 shadow-[0_0_15px_rgba(0,209,178,0.2)] hover:shadow-[0_0_25px_rgba(110,231,249,0.4)]"
          >
            Request a demo
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/product"
            data-testid="cta-product-button"
            className="inline-flex items-center gap-2 bg-white/5 text-white border border-white/10 px-8 py-4 text-sm font-medium rounded-sm hover:bg-white/10 transition-all duration-300"
          >
            View product specs
          </Link>
        </div>
      </div>
    </section>
  );
}
