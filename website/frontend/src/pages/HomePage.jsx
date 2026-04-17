import { useEffect } from 'react';
import Navbar from '../components/Navbar';
import HeroSection from '../components/HeroSection';
import FeaturesGrid from '../components/FeaturesGrid';
import HowItWorks from '../components/HowItWorks';
import TrustStrip from '../components/TrustStrip';
import CTABanner from '../components/CTABanner';
import Footer from '../components/Footer';

export default function HomePage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div data-testid="home-page" className="bg-[#0B0D10] min-h-screen">
      <Navbar />
      <HeroSection />
      <div className="section-divider" />
      <FeaturesGrid />
      <div className="section-divider" />
      <HowItWorks />
      <TrustStrip />
      <CTABanner />
      <Footer />
    </div>
  );
}
