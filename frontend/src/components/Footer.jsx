import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const LOGO_URL = "/Logo.png";

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
    <footer data-testid="footer" className="bg-[#0B0D10] border-t border-white/[0.05]">
      <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">

          {/* Brand */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <img
              src={LOGO_URL}
              alt="Axalon Systems"
              className="h-10 invert opacity-70 mb-5"
            />
            <p className="text-sm text-gray-600 leading-relaxed">
              Autonomous inspection drones for reliable industrial decisions.
            </p>
            <div className="flex items-center gap-2 mt-5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00D1B2] pulse-dot" />
              <span className="text-[10px] font-mono tracking-wider uppercase text-[#00D1B2]/60">Systems nominal</span>
            </div>
          </motion.div>

          {/* Links */}
          {Object.entries(footerLinks).map(([title, links], colIdx) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: (colIdx + 1) * 0.08 }}
            >
              <h4 className="text-[10px] tracking-[0.2em] uppercase text-gray-600 font-semibold mb-4">{title}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.path}
                      className="text-sm text-gray-500 hover:text-white transition-colors duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-16 pt-8 border-t border-white/[0.05] flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-gray-700">
            &copy; {new Date().getFullYear()} Axalon Systems. All rights reserved.
          </p>
          <div className="flex gap-6">
            <span className="text-xs text-gray-700 hover:text-gray-400 transition-colors cursor-pointer">Privacy Policy</span>
            <span className="text-xs text-gray-700 hover:text-gray-400 transition-colors cursor-pointer">Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
