import { useEffect, useRef } from 'react';
import { MapPin, Cpu, FileText } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

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
  const sectionRef = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.step-card', {
        x: -30,
        opacity: 0,
        duration: 0.7,
        ease: 'power2.out',
        stagger: 0.15,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 75%',
        },
      });

      gsap.from('.step-line', {
        scaleY: 0,
        transformOrigin: 'top',
        duration: 0.8,
        ease: 'power2.out',
        stagger: 0.15,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 75%',
        },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      data-testid="how-it-works-section"
      className="relative py-24 md:py-32 bg-[#111318]"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          {/* Left: header */}
          <div className="lg:sticky lg:top-32">
            <p className="text-sm tracking-[0.2em] uppercase text-[#00D1B2] font-medium mb-4">
              How it works
            </p>
            <h2 className="text-3xl md:text-4xl font-display font-medium tracking-tight text-white mb-6">
              From deployment to decisions in minutes
            </h2>
            <p className="text-base leading-relaxed text-gray-400 max-w-md">
              Axalon drones integrate seamlessly into existing inspection workflows. Three steps from launch to actionable insight.
            </p>
          </div>

          {/* Right: steps */}
          <div className="space-y-0">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.id} data-testid={step.id} className="step-card relative pl-12 pb-12 last:pb-0">
                  {/* Vertical line */}
                  {i < steps.length - 1 && (
                    <div className="step-line absolute left-[19px] top-10 bottom-0 w-px bg-white/[0.06]" />
                  )}

                  {/* Number dot */}
                  <div className="absolute left-0 top-0 w-10 h-10 flex items-center justify-center bg-[#161A20] border border-white/10">
                    <span className="text-xs font-display font-medium text-[#00D1B2]">{step.num}</span>
                  </div>

                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <Icon className="w-4 h-4 text-[#6EE7F9]" />
                      <h3 className="text-lg font-medium text-white font-display">{step.title}</h3>
                    </div>
                    <p className="text-sm leading-relaxed text-gray-400">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
