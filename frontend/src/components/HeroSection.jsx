import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Download } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const HERO_BG = "https://images.unsplash.com/photo-1770936994282-8811fb7129ac?crop=entropy&cs=srgb&fm=jpg&q=85&w=1920";
const DRONE_IMG = "https://images.unsplash.com/photo-1753781466384-cf5eee0a505d?crop=entropy&cs=srgb&fm=jpg&q=85&w=800";

export default function HeroSection() {
  const sectionRef = useRef(null);
  const bgRef = useRef(null);
  const contentRef = useRef(null);
  const droneRef = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Parallax background
      gsap.to(bgRef.current, {
        yPercent: -6,
        ease: 'none',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      });

      // Drone parallax (midground)
      gsap.to(droneRef.current, {
        yPercent: -12,
        ease: 'none',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      });

      // Content reveal
      gsap.from('.hero-caption', { y: 10, opacity: 0, duration: 0.6, delay: 0.2 });
      gsap.from('.hero-headline', { y: 24, opacity: 0, duration: 0.9, ease: 'power2.out', delay: 0.4 });
      gsap.from('.hero-subhead', { y: 16, opacity: 0, duration: 0.8, ease: 'power2.out', delay: 0.7 });
      gsap.from('.hero-cta', { y: 16, opacity: 0, duration: 0.7, ease: 'power2.out', delay: 1.0, stagger: 0.12 });
      gsap.from('.hero-stats', { y: 16, opacity: 0, duration: 0.7, ease: 'power2.out', delay: 1.3 });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      data-testid="hero-section"
      className="relative min-h-screen flex items-center overflow-hidden"
    >
      {/* Background image layer */}
      <div
        ref={bgRef}
        className="absolute inset-0 scale-110"
        style={{
          backgroundImage: `url(${HERO_BG})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 40%',
        }}
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B0D10] via-[#0B0D10]/80 to-[#0B0D10]/40" />

      {/* LiDAR grid overlay */}
      <div className="absolute inset-0 lidar-grid opacity-40" />

      {/* Scan line effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="scan-line absolute w-full h-px bg-gradient-to-r from-transparent via-[#00D1B2]/30 to-transparent" />
      </div>

      {/* Drone image (midground) */}
      <div
        ref={droneRef}
        className="absolute right-[8%] top-[20%] w-[300px] md:w-[450px] opacity-70"
      >
        <img
          src={DRONE_IMG}
          alt="Axalon inspection drone in flight"
          className="w-full drop-shadow-2xl"
          style={{ filter: 'brightness(0.8) contrast(1.1)' }}
        />
        {/* Teal accent glow under drone */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-[#00D1B2]/10 blur-xl rounded-full" />
      </div>

      {/* Content */}
      <div ref={contentRef} className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 lg:px-24 pt-32 pb-20">
        <div className="max-w-2xl">
          <p className="hero-caption text-sm tracking-[0.2em] uppercase text-[#00D1B2] font-medium mb-6 font-body">
            Autonomous Inspection Platform
          </p>

          <h1 className="hero-headline text-4xl sm:text-5xl lg:text-6xl font-medium tracking-tight text-white leading-[1.1] font-display mb-6">
            Autonomous inspection drones built for reliable industrial decisions.
          </h1>

          <p className="hero-subhead text-base md:text-lg leading-relaxed text-gray-400 mb-10 max-w-lg font-body">
            AI-enabled, modular UAS for precise data capture and automated reporting — starting with solar asset inspections.
          </p>

          <div className="flex flex-wrap gap-4">
            <Link
              to="/contact"
              data-testid="hero-cta-demo"
              className="hero-cta inline-flex items-center gap-2 bg-[#00D1B2] text-[#0B0D10] px-8 py-4 text-sm font-medium rounded-sm hover:bg-[#6EE7F9] transition-all duration-300 shadow-[0_0_15px_rgba(0,209,178,0.2)] hover:shadow-[0_0_25px_rgba(110,231,249,0.4)]"
            >
              Request a demo
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#features"
              data-testid="hero-cta-datasheet"
              className="hero-cta inline-flex items-center gap-2 bg-white/5 text-white border border-white/10 px-8 py-4 text-sm font-medium rounded-sm hover:bg-white/10 transition-all duration-300 backdrop-blur-sm"
            >
              <Download className="w-4 h-4" />
              Download datasheet
            </a>
          </div>

          {/* Stats bar */}
          <div className="hero-stats flex gap-10 mt-16 pt-8 border-t border-white/[0.06]">
            <div>
              <p className="text-2xl md:text-3xl font-display font-medium text-white">99.7%</p>
              <p className="text-xs tracking-wider uppercase text-gray-500 mt-1">Detection accuracy</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-display font-medium text-white">3x</p>
              <p className="text-xs tracking-wider uppercase text-gray-500 mt-1">Faster inspections</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-display font-medium text-white">50MW+</p>
              <p className="text-xs tracking-wider uppercase text-gray-500 mt-1">Capacity inspected</p>
            </div>
          </div>
        </div>
      </div>

      {/* Data annotations */}
      <div className="absolute bottom-8 right-8 hidden lg:flex items-center gap-3 data-annotation text-[#00D1B2]/60">
        <div className="w-2 h-2 rounded-full bg-[#00D1B2] pulse-dot" />
        <span>LIVE TELEMETRY FEED</span>
      </div>
    </section>
  );
}
