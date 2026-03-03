import { useEffect } from 'react';
import { Mail, MapPin, Phone } from 'lucide-react';
import gsap from 'gsap';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function ContactPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.contact-hero-text', {
        y: 30,
        opacity: 0,
        duration: 0.8,
        ease: 'power2.out',
        stagger: 0.1,
      });
    });
    return () => ctx.revert();
  }, []);

  return (
    <div className="bg-[#0B0D10] min-h-screen">
      <Navbar />

      <section data-testid="contact-page" className="pt-32 pb-20 px-6 md:px-12 lg:px-24">
        <div className="max-w-3xl mx-auto">
          <p className="contact-hero-text text-sm tracking-[0.2em] uppercase text-[#00D1B2] font-medium mb-4">
            Contact
          </p>
          <h1 className="contact-hero-text text-4xl sm:text-5xl lg:text-6xl font-display font-medium tracking-tight text-white leading-[1.1] mb-6">
            Let's discuss your inspection needs
          </h1>
          <p className="contact-hero-text text-base md:text-lg leading-relaxed text-gray-400 mb-12 max-w-lg">
            Reach out to us about autonomous inspection capabilities for your infrastructure.
          </p>

          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 flex items-center justify-center bg-[#161A20] border border-white/5 shrink-0">
                <Mail className="w-4 h-4 text-[#00D1B2]" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Email</p>
                <p className="text-sm text-gray-400">contact@axalonsystems.com</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 flex items-center justify-center bg-[#161A20] border border-white/5 shrink-0">
                <MapPin className="w-4 h-4 text-[#00D1B2]" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Office</p>
                <p className="text-sm text-gray-400">Mumbai, India</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 flex items-center justify-center bg-[#161A20] border border-white/5 shrink-0">
                <Phone className="w-4 h-4 text-[#00D1B2]" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Phone</p>
                <p className="text-sm text-gray-400">Available upon request</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
