import { Link } from 'react-router-dom';

const LOGO_URL = "/logo.png";

const footerLinks = {
  Product: [
    { label: 'Overview', path: '/product' },
    { label: 'Specifications', path: '/product#specs' },
    { label: 'Payload Options', path: '/product#payload' },
  ],
  Resources: [
    { label: 'Case Studies', path: '/resources' },
    { label: 'Documentation', path: '/resources' },
    { label: 'API Reference', path: '/resources' },
  ],
  Company: [
    { label: 'About', path: '/contact' },
    { label: 'Contact', path: '/contact' },
    { label: 'Careers', path: '/contact' },
  ],
};

export default function Footer() {
  return (
    <footer data-testid="footer" className="bg-[#0B0D10] border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand */}
          <div>
            <img
              src={LOGO_URL}
              alt="Axalon Systems"
              className="h-7 invert opacity-80 mb-5"
            />
            <p className="text-sm text-gray-500 leading-relaxed">
              Autonomous inspection drones for reliable industrial decisions.
            </p>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-xs tracking-[0.15em] uppercase text-gray-500 font-semibold mb-4">{title}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.path}
                      className="text-sm text-gray-400 hover:text-white transition-colors duration-300"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-16 pt-8 border-t border-white/[0.06] flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-gray-600">
            &copy; {new Date().getFullYear()} Axalon Systems. All rights reserved.
          </p>
          <div className="flex gap-6">
            <span className="text-xs text-gray-600 hover:text-gray-400 transition-colors cursor-pointer">Privacy Policy</span>
            <span className="text-xs text-gray-600 hover:text-gray-400 transition-colors cursor-pointer">Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
