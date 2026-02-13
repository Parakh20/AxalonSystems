import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const stats = [
  { value: '99.7%', label: 'Defect detection rate', suffix: '' },
  { value: '3x', label: 'Faster than manual inspection', suffix: '' },
  { value: '50MW+', label: 'Solar capacity inspected', suffix: '' },
  { value: '<2hr', label: 'From flight to report', suffix: '' },
];

export default function TrustStrip() {
  const ref = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.trust-stat', {
        y: 20,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: ref.current,
          start: 'top 85%',
        },
      });
    }, ref);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={ref} data-testid="trust-strip" className="py-16 bg-[#0B0D10] border-y border-white/[0.04]">
      <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s) => (
            <div key={s.label} className="trust-stat text-center md:text-left">
              <p className="text-3xl md:text-4xl font-display font-medium text-white mb-2">{s.value}</p>
              <p className="text-xs tracking-wider uppercase text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
