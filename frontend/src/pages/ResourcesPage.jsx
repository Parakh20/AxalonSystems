import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import CTABanner from '../components/CTABanner';

gsap.registerPlugin(ScrollTrigger);

const SOLAR_RGB = "https://images.unsplash.com/photo-1770936994282-8811fb7129ac?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";
const THERMAL_IMG = "/thermal_solar.jpg";
const SOLAR_CLOSE = "https://images.unsplash.com/photo-1743352476730-056502fba10b?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

const caseStudies = [
  {
    id: 'solar-50mw',
    title: '50MW Solar Park Inspection',
    location: 'Rajasthan, India',
    metric: '847 anomalies detected',
    desc: 'Full-site inspection completed in 4.5 hours, identifying hotspots, micro-cracks, and bypass diode failures across 180,000 panels.',
    tags: ['LiDAR', 'Thermal', 'RGB'],
  },
  {
    id: 'predictive-maint',
    title: 'Predictive Maintenance Pilot',
    location: 'Gujarat, India',
    metric: '23% reduction in downtime',
    desc: 'Quarterly autonomous inspection flights enabling predictive maintenance scheduling, reducing unplanned outages by 23% over 12 months.',
    tags: ['AI Analytics', 'Automated Reports'],
  },
  {
    id: 'rapid-assess',
    title: 'Post-Storm Rapid Assessment',
    location: 'Tamil Nadu, India',
    metric: '< 6 hours to full report',
    desc: 'Emergency deployment after cyclone damage. Autonomous drone survey of 20MW facility with AI-generated damage assessment report within hours.',
    tags: ['Rapid Deploy', 'Damage Assessment'],
  },
];

export default function ResourcesPage() {
  const [sliderPos, setSliderPos] = useState(50);
  const compRef = useRef(null);
  const casesRef = useRef(null);
  const sliderContainerRef = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.resource-hero-text', {
        y: 30,
        opacity: 0,
        duration: 0.8,
        ease: 'power2.out',
        stagger: 0.1,
      });

      gsap.from('.case-card', {
        y: 40,
        opacity: 0,
        duration: 0.7,
        ease: 'power2.out',
        stagger: 0.12,
        scrollTrigger: { trigger: casesRef.current, start: 'top 80%' },
      });
    });

    return () => ctx.revert();
  }, []);

  const handleSliderMove = (e) => {
    if (!sliderContainerRef.current) return;
    const rect = sliderContainerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(pct);
  };

  return (
    <div className="bg-[#0B0D10] min-h-screen">
      <Navbar />

      {/* Hero */}
      <section data-testid="resources-hero" className="pt-32 pb-20 px-6 md:px-12 lg:px-24">
        <div className="max-w-7xl mx-auto">
          <p className="resource-hero-text text-sm tracking-[0.2em] uppercase text-[#00D1B2] font-medium mb-4">
            Resources
          </p>
          <h1 className="resource-hero-text text-4xl sm:text-5xl lg:text-6xl font-display font-medium tracking-tight text-white leading-[1.1] mb-6 max-w-3xl">
            Real data. Real results.
          </h1>
          <p className="resource-hero-text text-base md:text-lg leading-relaxed text-gray-400 max-w-lg">
            Explore how Axalon drones deliver actionable intelligence across solar asset inspections.
          </p>
        </div>
      </section>

      {/* RGB + Thermal Comparison */}
      <section ref={compRef} data-testid="thermal-comparison" className="py-24 md:py-32 bg-[#111318]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24">
          <div className="mb-12">
            <p className="text-sm tracking-[0.2em] uppercase text-[#00D1B2] font-medium mb-4">
              Inspection Data
            </p>
            <h2 className="text-3xl md:text-4xl font-display font-medium tracking-tight text-white mb-4">
              RGB + Thermal comparison
            </h2>
            <p className="text-base text-gray-400">Drag the slider to compare standard RGB and thermal imaging data.</p>
          </div>

          {/* Comparison slider */}
          <div
            ref={sliderContainerRef}
            data-testid="comparison-slider"
            className="relative w-full h-[300px] md:h-[450px] cursor-col-resize overflow-hidden bg-[#161A20] border border-white/5 select-none"
            onMouseMove={(e) => e.buttons === 1 && handleSliderMove(e)}
            onMouseDown={handleSliderMove}
            onTouchMove={handleSliderMove}
          >
            {/* RGB layer (full) */}
            <img
              src={SOLAR_RGB}
              alt="RGB view of solar panels"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'brightness(0.8)' }}
              draggable={false}
            />

            {/* Thermal layer (clipped) */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
            >
              <img
                src={THERMAL_IMG}
                alt="Thermal view showing hotspots"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: 'brightness(0.9)' }}
                draggable={false}
              />
            </div>

            {/* Slider line */}
            <div
              className="absolute top-0 bottom-0 w-px bg-[#00D1B2] pointer-events-none"
              style={{ left: `${sliderPos}%` }}
            >
              {/* Handle */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-[#0B0D10] border-2 border-[#00D1B2] rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(0,209,178,0.3)]">
                <div className="flex gap-0.5">
                  <div className="w-0.5 h-3 bg-[#00D1B2] rounded-full" />
                  <div className="w-0.5 h-3 bg-[#00D1B2] rounded-full" />
                </div>
              </div>
            </div>

            {/* Labels */}
            <div className="absolute top-4 left-4 px-3 py-1 bg-[#0B0D10]/80 backdrop-blur-sm text-xs text-gray-400 font-mono tracking-wider uppercase">
              RGB
            </div>
            <div className="absolute top-4 right-4 px-3 py-1 bg-[#0B0D10]/80 backdrop-blur-sm text-xs text-[#00D1B2] font-mono tracking-wider uppercase">
              Thermal
            </div>
          </div>
        </div>
      </section>

      {/* Case Studies */}
      <section ref={casesRef} data-testid="case-studies" className="py-24 md:py-32 bg-[#0B0D10]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24">
          <div className="mb-16">
            <p className="text-sm tracking-[0.2em] uppercase text-[#00D1B2] font-medium mb-4">
              Case Studies
            </p>
            <h2 className="text-3xl md:text-4xl font-display font-medium tracking-tight text-white">
              Deployed. Proven. Trusted.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {caseStudies.map((cs) => (
              <div
                key={cs.id}
                data-testid={`case-study-${cs.id}`}
                className="case-card group bg-[#161A20] border border-white/5 p-8 hover:border-[#00D1B2]/30 transition-all duration-500"
              >
                <div className="flex flex-wrap gap-2 mb-6">
                  {cs.tags.map((tag) => (
                    <span key={tag} className="px-2 py-1 text-[10px] tracking-wider uppercase bg-[#00D1B2]/10 text-[#00D1B2] font-medium">
                      {tag}
                    </span>
                  ))}
                </div>

                <h3 className="text-lg font-display font-medium text-white mb-2">{cs.title}</h3>
                <p className="text-xs text-gray-500 mb-4 font-mono">{cs.location}</p>
                <p className="text-sm text-gray-400 leading-relaxed mb-6">{cs.desc}</p>

                <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-sm font-display font-medium text-[#00D1B2]">{cs.metric}</span>
                  <ExternalLink className="w-4 h-4 text-gray-600 group-hover:text-[#00D1B2] transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data showcase */}
      <section data-testid="data-showcase" className="py-24 md:py-32 bg-[#111318]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-sm tracking-[0.2em] uppercase text-[#00D1B2] font-medium mb-4">
                Data Analytics
              </p>
              <h2 className="text-3xl md:text-4xl font-display font-medium tracking-tight text-white mb-6">
                From raw data to actionable insights
              </h2>
              <p className="text-base leading-relaxed text-gray-400 mb-8">
                Our AI pipeline processes multi-sensor data to classify defects, map severity, and generate maintenance priority rankings — all automated.
              </p>
              <div className="space-y-4">
                {['Automatic hotspot classification', 'GPS-tagged anomaly reports', 'Trend analysis over inspection cycles', 'Export to industry-standard formats'].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <ArrowRight className="w-4 h-4 text-[#00D1B2] shrink-0" />
                    <span className="text-sm text-gray-300">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative overflow-hidden bg-[#161A20] border border-white/5">
              <img
                src={SOLAR_CLOSE}
                alt="Solar panel close-up inspection data"
                className="w-full h-[350px] object-cover opacity-70"
                style={{ filter: 'brightness(0.7)' }}
              />
              <div className="absolute inset-0 lidar-grid opacity-30" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#161A20] via-transparent to-transparent" />
              {/* Fake data points */}
              <div className="absolute top-[30%] left-[25%] w-3 h-3 rounded-full bg-[#EF4444] pulse-dot shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
              <div className="absolute top-[55%] left-[60%] w-3 h-3 rounded-full bg-[#FBBF24] pulse-dot shadow-[0_0_8px_rgba(251,191,36,0.5)]" style={{ animationDelay: '0.5s' }} />
              <div className="absolute top-[40%] left-[75%] w-2 h-2 rounded-full bg-[#00D1B2] pulse-dot shadow-[0_0_8px_rgba(0,209,178,0.5)]" style={{ animationDelay: '1s' }} />
            </div>
          </div>
        </div>
      </section>

      <CTABanner />
      <Footer />
    </div>
  );
}
