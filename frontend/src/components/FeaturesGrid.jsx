import { useEffect, useRef } from 'react';
import { Scan, Zap, Shield, Hexagon, Activity } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const features = [
  {
    icon: Zap,
    title: 'Autonomous Flight',
    desc: 'Fully autonomous mission planning and execution with intelligent path optimization and obstacle avoidance.',
    id: 'autonomous-flight',
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
  },
  {
    icon: Activity,
    title: 'Modular Payload',
    desc: 'Hot-swappable sensor bays supporting LiDAR, RGB, thermal, and multispectral payloads.',
    id: 'modular-payload',
  },
];

export default function FeaturesGrid() {
  const gridRef = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.feature-card', {
        y: 40,
        opacity: 0,
        duration: 0.7,
        ease: 'power2.out',
        stagger: 0.09,
        scrollTrigger: {
          trigger: gridRef.current,
          start: 'top 80%',
        },
      });
    }, gridRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id="features"
      ref={gridRef}
      data-testid="features-section"
      className="relative py-24 md:py-32 bg-[#0B0D10]"
    >
      {/* Noise overlay */}
      <div className="absolute inset-0 noise-overlay pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6 md:px-12 lg:px-24">
        {/* Section header */}
        <div className="mb-16">
          <p className="text-sm tracking-[0.2em] uppercase text-[#00D1B2] font-medium mb-4">
            Capabilities
          </p>
          <h2 className="text-3xl md:text-4xl font-display font-medium tracking-tight text-white">
            Engineering precision at every layer
          </h2>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.id}
                data-testid={`feature-card-${f.id}`}
                className="feature-card group relative bg-[#161A20] border border-white/5 p-8 overflow-hidden hover:border-[#00D1B2]/30 transition-colors duration-500"
              >
                {/* Hover glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#00D1B2]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative z-10">
                  <div className="w-10 h-10 flex items-center justify-center bg-[#00D1B2]/10 mb-6">
                    <Icon className="w-5 h-5 text-[#00D1B2]" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-3 font-display">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-gray-400">{f.desc}</p>
                </div>

                {/* Corner accent */}
                <div className="absolute top-0 right-0 w-12 h-px bg-gradient-to-l from-[#00D1B2]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
