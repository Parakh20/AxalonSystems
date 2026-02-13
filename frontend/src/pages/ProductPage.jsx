import { useEffect, useRef } from 'react';
import { Scan, Camera, Thermometer, Radio, Cpu, ChevronRight } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import CTABanner from '../components/CTABanner';

gsap.registerPlugin(ScrollTrigger);

const TECH_IMG = "https://images.unsplash.com/photo-1546425930-c93c758666dc?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

const payloadModules = [
  { icon: Scan, label: 'LiDAR Module', desc: 'High-density 3D point cloud, 300m range, 240k pts/sec', color: '#00D1B2' },
  { icon: Camera, label: 'RGB Camera', desc: '48MP sensor, 4K/60fps video, mechanical stabilization', color: '#6EE7F9' },
  { icon: Thermometer, label: 'Thermal Camera', desc: '640x512 resolution, NETD <40mK, radiometric output', color: '#FBBF24' },
  { icon: Radio, label: 'RTK GPS Antenna', desc: 'Multi-constellation GNSS, cm-level precision, PPK support', color: '#A78BFA' },
  { icon: Cpu, label: 'AI Compute Module', desc: 'Edge inference, 15 TOPS, real-time defect classification', color: '#F472B6' },
];

const specs = [
  { label: 'Max Flight Time', value: '45 min' },
  { label: 'Cruise Speed', value: '12 m/s' },
  { label: 'Max Payload', value: '2.4 kg' },
  { label: 'Operating Temp', value: '-10 to 50 C' },
  { label: 'Wind Resistance', value: '12 m/s' },
  { label: 'IP Rating', value: 'IP54' },
  { label: 'Communication', value: 'Encrypted 4G/5G + mesh' },
  { label: 'MTOW', value: '7.2 kg' },
];

export default function ProductPage() {
  const heroRef = useRef(null);
  const modulesRef = useRef(null);
  const specsRef = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.product-hero-text', {
        y: 30,
        opacity: 0,
        duration: 0.8,
        ease: 'power2.out',
        stagger: 0.1,
      });

      gsap.from('.module-card', {
        y: 40,
        opacity: 0,
        duration: 0.7,
        ease: 'power2.out',
        stagger: 0.09,
        scrollTrigger: { trigger: modulesRef.current, start: 'top 80%' },
      });

      gsap.from('.spec-row', {
        x: -20,
        opacity: 0,
        duration: 0.5,
        ease: 'power2.out',
        stagger: 0.06,
        scrollTrigger: { trigger: specsRef.current, start: 'top 80%' },
      });
    });

    return () => ctx.revert();
  }, []);

  return (
    <div className="bg-[#0B0D10] min-h-screen">
      <Navbar />

      {/* Hero */}
      <section ref={heroRef} data-testid="product-hero" className="pt-32 pb-20 px-6 md:px-12 lg:px-24">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="product-hero-text text-sm tracking-[0.2em] uppercase text-[#00D1B2] font-medium mb-4">
                Product
              </p>
              <h1 className="product-hero-text text-4xl sm:text-5xl lg:text-6xl font-display font-medium tracking-tight text-white leading-[1.1] mb-6">
                Modular by design. Precise by default.
              </h1>
              <p className="product-hero-text text-base md:text-lg leading-relaxed text-gray-400 max-w-lg">
                The Axalon UAS features a hot-swappable modular payload bay, allowing operators to configure sensor suites for any inspection mission.
              </p>
            </div>
            <div className="relative">
              <div className="relative overflow-hidden bg-[#161A20] border border-white/5">
                <img
                  src={TECH_IMG}
                  alt="Axalon UAS technical hardware"
                  className="w-full h-[400px] object-cover opacity-80"
                  style={{ filter: 'brightness(0.7) contrast(1.1)' }}
                />
                {/* Grid overlay */}
                <div className="absolute inset-0 lidar-grid opacity-20" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#161A20] to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Payload Modules */}
      <section id="payload" ref={modulesRef} data-testid="payload-modules" className="py-24 md:py-32 bg-[#111318]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24">
          <p className="text-sm tracking-[0.2em] uppercase text-[#00D1B2] font-medium mb-4">
            Payload Configuration
          </p>
          <h2 className="text-3xl md:text-4xl font-display font-medium tracking-tight text-white mb-16">
            Five integrated sensor modules
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {payloadModules.map((m) => {
              const Icon = m.icon;
              return (
                <div
                  key={m.label}
                  data-testid={`module-${m.label.toLowerCase().replace(/\s/g, '-')}`}
                  className="module-card group bg-[#161A20] border border-white/5 p-8 hover:border-white/10 transition-all duration-500"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className="w-10 h-10 flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${m.color}15` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: m.color }} />
                    </div>
                    <div>
                      <h3 className="text-base font-medium text-white font-display mb-2">{m.label}</h3>
                      <p className="text-sm text-gray-400 leading-relaxed">{m.desc}</p>
                    </div>
                  </div>
                  <div className="mt-6 flex items-center gap-1 text-xs text-gray-500 group-hover:text-[#00D1B2] transition-colors">
                    <span>View specifications</span>
                    <ChevronRight className="w-3 h-3" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Technical Specs */}
      <section id="specs" ref={specsRef} data-testid="tech-specs" className="py-24 md:py-32 bg-[#0B0D10]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            <div>
              <p className="text-sm tracking-[0.2em] uppercase text-[#00D1B2] font-medium mb-4">
                Technical Specifications
              </p>
              <h2 className="text-3xl md:text-4xl font-display font-medium tracking-tight text-white mb-6">
                Built for industrial conditions
              </h2>
              <p className="text-base leading-relaxed text-gray-400">
                Every component is engineered for reliability in harsh operating environments — from desert solar farms to high-altitude installations.
              </p>
            </div>

            <div className="space-y-0">
              {specs.map((s) => (
                <div
                  key={s.label}
                  className="spec-row flex justify-between items-center py-4 border-b border-white/[0.06]"
                >
                  <span className="text-sm text-gray-400">{s.label}</span>
                  <span className="text-sm font-display font-medium text-white">{s.value}</span>
                </div>
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
