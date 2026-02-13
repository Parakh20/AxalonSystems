import { useState, useEffect, useRef } from 'react';
import { ArrowRight, Mail, MapPin, Phone, CheckCircle } from 'lucide-react';
import gsap from 'gsap';
import axios from 'axios';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', company: '', role: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const formRef = useRef(null);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.company) {
      setError('Please fill in all required fields.');
      return;
    }
    setError('');
    setSending(true);

    try {
      await axios.post(`${API}/demo-requests`, form);
      setSent(true);
      setForm({ name: '', email: '', company: '', role: '', message: '' });
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-[#0B0D10] min-h-screen">
      <Navbar />

      <section data-testid="contact-page" className="pt-32 pb-20 px-6 md:px-12 lg:px-24">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            {/* Left: Info */}
            <div>
              <p className="contact-hero-text text-sm tracking-[0.2em] uppercase text-[#00D1B2] font-medium mb-4">
                Contact
              </p>
              <h1 className="contact-hero-text text-4xl sm:text-5xl lg:text-6xl font-display font-medium tracking-tight text-white leading-[1.1] mb-6">
                Let's discuss your inspection needs
              </h1>
              <p className="contact-hero-text text-base md:text-lg leading-relaxed text-gray-400 mb-12 max-w-lg">
                Schedule a personalized demo or ask us anything about autonomous inspection capabilities for your infrastructure.
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
                    <p className="text-sm text-gray-400">Bengaluru, India</p>
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

            {/* Right: Form */}
            <div ref={formRef}>
              {sent ? (
                <div data-testid="demo-success" className="bg-[#161A20] border border-[#00D1B2]/30 p-12 text-center">
                  <CheckCircle className="w-12 h-12 text-[#00D1B2] mx-auto mb-6" />
                  <h3 className="text-xl font-display font-medium text-white mb-3">Demo request received</h3>
                  <p className="text-sm text-gray-400">Our team will get back to you within 24 hours.</p>
                  <button
                    data-testid="send-another-btn"
                    onClick={() => setSent(false)}
                    className="mt-6 text-sm text-[#00D1B2] hover:text-[#6EE7F9] transition-colors"
                  >
                    Send another request
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  data-testid="demo-request-form"
                  className="bg-[#161A20] border border-white/5 p-8 md:p-10 space-y-6"
                >
                  <h3 className="text-lg font-display font-medium text-white mb-2">Request a demo</h3>
                  <p className="text-sm text-gray-400 mb-6">Fill in your details and we'll schedule a walkthrough.</p>

                  {error && (
                    <p data-testid="form-error" className="text-sm text-red-400 bg-red-400/10 px-4 py-2">{error}</p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Name *</label>
                      <input
                        data-testid="input-name"
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full bg-[#111318] border border-white/10 text-white px-4 py-3 text-sm focus:ring-1 focus:ring-[#00D1B2] focus:border-[#00D1B2] outline-none transition-all placeholder:text-gray-600"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Email *</label>
                      <input
                        data-testid="input-email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className="w-full bg-[#111318] border border-white/10 text-white px-4 py-3 text-sm focus:ring-1 focus:ring-[#00D1B2] focus:border-[#00D1B2] outline-none transition-all placeholder:text-gray-600"
                        placeholder="you@company.com"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Company *</label>
                      <input
                        data-testid="input-company"
                        type="text"
                        value={form.company}
                        onChange={(e) => setForm({ ...form, company: e.target.value })}
                        className="w-full bg-[#111318] border border-white/10 text-white px-4 py-3 text-sm focus:ring-1 focus:ring-[#00D1B2] focus:border-[#00D1B2] outline-none transition-all placeholder:text-gray-600"
                        placeholder="Company name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Role</label>
                      <input
                        data-testid="input-role"
                        type="text"
                        value={form.role}
                        onChange={(e) => setForm({ ...form, role: e.target.value })}
                        className="w-full bg-[#111318] border border-white/10 text-white px-4 py-3 text-sm focus:ring-1 focus:ring-[#00D1B2] focus:border-[#00D1B2] outline-none transition-all placeholder:text-gray-600"
                        placeholder="Your role"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Message</label>
                    <textarea
                      data-testid="input-message"
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      rows={4}
                      className="w-full bg-[#111318] border border-white/10 text-white px-4 py-3 text-sm focus:ring-1 focus:ring-[#00D1B2] focus:border-[#00D1B2] outline-none transition-all placeholder:text-gray-600 resize-none"
                      placeholder="Tell us about your inspection needs..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={sending}
                    data-testid="submit-demo-btn"
                    className="w-full inline-flex items-center justify-center gap-2 bg-[#00D1B2] text-[#0B0D10] px-8 py-4 text-sm font-medium rounded-sm hover:bg-[#6EE7F9] transition-all duration-300 shadow-[0_0_15px_rgba(0,209,178,0.2)] hover:shadow-[0_0_25px_rgba(110,231,249,0.4)] disabled:opacity-50"
                  >
                    {sending ? 'Sending...' : 'Submit request'}
                    {!sending && <ArrowRight className="w-4 h-4" />}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
