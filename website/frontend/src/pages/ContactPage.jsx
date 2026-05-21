import { useEffect, useState } from 'react';
import { Mail, MapPin, Phone, CheckCircle, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import axios from 'axios';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

const fieldVariants = {
  hidden: { opacity: 0, y: 16 },
  show: (i) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut', delay: i * 0.07 },
  }),
};

const contactInfo = [
  { icon: Mail, label: 'Email', value: 'contact@axalonsystems.com' },
  { icon: MapPin, label: 'Office', value: 'Mumbai, India' },
  { icon: Phone, label: 'Phone', value: 'Available upon request' },
];

const initialForm = { name: '', email: '', company: '', role: '', message: '' };

export default function ContactPage() {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState('');

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

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');
    try {
      await axios.post(`${BACKEND_URL}/api/demo-requests`, form);
      setStatus('success');
      setForm(initialForm);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err?.response?.data?.detail || 'Something went wrong. Please try again.');
    }
  };

  return (
    <div className="bg-[#0B0D10] min-h-screen">
      <Navbar />

      <section data-testid="contact-page" className="pt-32 pb-20 px-6 md:px-12 lg:px-24">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">

            {/* Left — info */}
            <div>
              <p className="contact-hero-text text-sm tracking-[0.2em] uppercase text-[#00D1B2] font-medium mb-4">
                Contact
              </p>
              <h1 className="contact-hero-text text-4xl sm:text-5xl font-display font-medium tracking-tight text-white leading-[1.1] mb-6">
                Let's discuss your inspection needs
              </h1>
              <p className="contact-hero-text text-base md:text-lg leading-relaxed text-gray-400 mb-12 max-w-md">
                Reach out to learn how Axalon's autonomous inspection platform can work for your infrastructure.
              </p>

              <div className="space-y-6">
                {contactInfo.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-4">
                    <div className="w-10 h-10 flex items-center justify-center bg-[#161A20] border border-white/5 shrink-0">
                      <Icon className="w-4 h-4 text-[#00D1B2]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{label}</p>
                      <p className="text-sm text-gray-400">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — form */}
            <div>
              <AnimatePresence mode="wait">
                {status === 'success' ? (
                  <motion.div
                    key="success"
                    data-testid="contact-success"
                    className="flex flex-col items-center justify-center h-full py-20 text-center"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    <CheckCircle className="w-12 h-12 text-[#00D1B2] mb-5" />
                    <h3 className="text-xl font-display font-medium text-white mb-3">Message received</h3>
                    <p className="text-sm text-gray-400 max-w-xs">
                      We'll be in touch within one business day.
                    </p>
                    <motion.button
                      className="mt-8 text-sm text-[#00D1B2] hover:text-[#6EE7F9] transition-colors"
                      onClick={() => setStatus('idle')}
                      whileHover={{ x: 2 }}
                    >
                      Send another message →
                    </motion.button>
                  </motion.div>
                ) : (
                  <motion.form
                    key="form"
                    data-testid="contact-form"
                    onSubmit={handleSubmit}
                    className="space-y-5"
                    initial="hidden"
                    animate="show"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      {[
                        { name: 'name', label: 'Full name', placeholder: 'Jane Smith', required: true, i: 0 },
                        { name: 'email', label: 'Work email', placeholder: 'jane@company.com', type: 'email', required: true, i: 1 },
                      ].map(({ name, label, placeholder, type = 'text', required, i }) => (
                        <motion.div key={name} custom={i} variants={fieldVariants}>
                          <label className="block text-xs tracking-wider uppercase text-gray-500 mb-2" htmlFor={name}>
                            {label}{required && <span className="text-[#00D1B2] ml-1">*</span>}
                          </label>
                          <input
                            id={name}
                            name={name}
                            type={type}
                            required={required}
                            value={form[name]}
                            onChange={handleChange}
                            placeholder={placeholder}
                            data-testid={`contact-field-${name}`}
                            className="w-full bg-[#111318] border border-white/10 text-white text-sm px-4 py-3 focus:ring-1 focus:ring-[#00D1B2] focus:border-[#00D1B2] outline-none transition-all placeholder:text-gray-600"
                          />
                        </motion.div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      {[
                        { name: 'company', label: 'Company', placeholder: 'Acme Solar Ltd.', required: true, i: 2 },
                        { name: 'role', label: 'Role', placeholder: 'Operations Manager', required: false, i: 3 },
                      ].map(({ name, label, placeholder, required, i }) => (
                        <motion.div key={name} custom={i} variants={fieldVariants}>
                          <label className="block text-xs tracking-wider uppercase text-gray-500 mb-2" htmlFor={name}>
                            {label}{required && <span className="text-[#00D1B2] ml-1">*</span>}
                          </label>
                          <input
                            id={name}
                            name={name}
                            type="text"
                            required={required}
                            value={form[name]}
                            onChange={handleChange}
                            placeholder={placeholder}
                            data-testid={`contact-field-${name}`}
                            className="w-full bg-[#111318] border border-white/10 text-white text-sm px-4 py-3 focus:ring-1 focus:ring-[#00D1B2] focus:border-[#00D1B2] outline-none transition-all placeholder:text-gray-600"
                          />
                        </motion.div>
                      ))}
                    </div>

                    <motion.div custom={4} variants={fieldVariants}>
                      <label className="block text-xs tracking-wider uppercase text-gray-500 mb-2" htmlFor="message">
                        Message
                      </label>
                      <textarea
                        id="message"
                        name="message"
                        rows={5}
                        value={form.message}
                        onChange={handleChange}
                        placeholder="Tell us about your inspection requirements — site size, assets, timelines..."
                        data-testid="contact-field-message"
                        className="w-full bg-[#111318] border border-white/10 text-white text-sm px-4 py-3 focus:ring-1 focus:ring-[#00D1B2] focus:border-[#00D1B2] outline-none transition-all placeholder:text-gray-600 resize-none"
                      />
                    </motion.div>

                    {status === 'error' && (
                      <motion.p
                        className="text-sm text-[#EF4444]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        {errorMsg}
                      </motion.p>
                    )}

                    <motion.div custom={5} variants={fieldVariants}>
                      <motion.button
                        type="submit"
                        data-testid="contact-submit"
                        disabled={status === 'loading'}
                        className="inline-flex items-center gap-2 bg-[#00D1B2] text-[#0B0D10] px-8 py-4 text-sm font-medium rounded-sm disabled:opacity-60 shadow-[0_0_15px_rgba(0,209,178,0.2)] hover:shadow-[0_0_25px_rgba(110,231,249,0.4)] hover:bg-[#6EE7F9] transition-colors duration-300"
                        whileHover={{ scale: status === 'loading' ? 1 : 1.02 }}
                        whileTap={{ scale: status === 'loading' ? 1 : 0.97 }}
                      >
                        {status === 'loading' ? (
                          <>
                            <Loader className="w-4 h-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          'Send message'
                        )}
                      </motion.button>
                    </motion.div>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>

          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
