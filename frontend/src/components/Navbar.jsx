import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ArrowRight } from 'lucide-react';

const LOGO_URL = "https://customer-assets.emergentagent.com/job_58ff1737-c27d-4aa3-a122-97ea875a1003/artifacts/ozferzxn_LogoWithName.png";

const navLinks = [
  { label: 'Product', path: '/product' },
  { label: 'Resources', path: '/resources' },
  { label: 'Contact', path: '/contact' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  return (
    <nav
      data-testid="navbar"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-[#0B0D10]/90 backdrop-blur-xl border-b border-white/[0.06]'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link to="/" data-testid="nav-logo" className="flex items-center gap-3 group">
            <img
              src={LOGO_URL}
              alt="Axalon Systems"
              className="h-8 brightness-0 invert opacity-90 group-hover:opacity-100 transition-opacity"
            />
          </Link>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-10">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                data-testid={`nav-link-${link.label.toLowerCase()}`}
                className={`text-sm tracking-wide transition-colors duration-300 ${
                  location.pathname === link.path
                    ? 'text-[#00D1B2]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-4">
            <Link
              to="/contact"
              data-testid="nav-cta-demo"
              className="inline-flex items-center gap-2 bg-[#00D1B2] text-[#0B0D10] px-6 py-2.5 text-sm font-medium rounded-sm hover:bg-[#6EE7F9] transition-all duration-300 shadow-[0_0_15px_rgba(0,209,178,0.2)] hover:shadow-[0_0_25px_rgba(110,231,249,0.4)]"
            >
              Request a demo
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            data-testid="nav-mobile-toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden text-gray-400 hover:text-white transition-colors"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div data-testid="nav-mobile-menu" className="md:hidden bg-[#0B0D10]/98 backdrop-blur-xl border-t border-white/[0.06]">
          <div className="px-6 py-8 space-y-6">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`block text-lg ${
                  location.pathname === link.path ? 'text-[#00D1B2]' : 'text-gray-400'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 bg-[#00D1B2] text-[#0B0D10] px-6 py-3 text-sm font-medium rounded-sm w-full justify-center"
            >
              Request a demo
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
