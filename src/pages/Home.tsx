import { useState } from 'react';
import { Link } from 'react-router-dom';
import WebsiteNav from '../components/WebsiteNav';
import SEO from '../components/SEO';
import {
  CameraIcon,
  PencilSquareIcon,
  UserGroupIcon,
  Squares2X2Icon,
  CommandLineIcon,
  VideoCameraIcon,
  ChatBubbleLeftEllipsisIcon,
  BellAlertIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  HashtagIcon,
  ArrowsUpDownIcon,
} from '@heroicons/react/24/outline';

const features = [
  {
    Icon: CameraIcon,
    title: 'Multi-Mode Capture',
    description: 'Full page, select area, pin element, or screen recording up to 30 seconds — users pick the right tool for the job.',
  },
  {
    Icon: PencilSquareIcon,
    title: 'Annotation Tools',
    description: 'Freehand pen, rectangles, arrows, text labels, and blur/redact — annotate directly on the screenshot before submitting.',
  },
  {
    Icon: CommandLineIcon,
    title: 'Console Output Capture',
    description: 'Optionally attach the full browser console (all log levels + unhandled errors) with every snap — no DevTools needed.',
  },
  {
    Icon: UserGroupIcon,
    title: 'Role-Based Widget',
    description: 'The floating widget is gated to specific Knack user roles. Everyone else never sees it.',
  },
  {
    Icon: Squares2X2Icon,
    title: 'Kanban + Drag & Drop',
    description: 'Real-time Kanban board across New, In Progress, Resolved, and Archived. Drag cards between columns or reorder within a column.',
  },
  {
    Icon: UserGroupIcon,
    title: 'Client Portal',
    description: 'Invite clients with a one-click link. They get their own real-time portal — same Kanban view, same annotations, no login friction.',
  },
  {
    Icon: ChatBubbleLeftEllipsisIcon,
    title: 'Threaded Comments',
    description: 'Staff and clients can discuss any snap with threaded comments. New posts appear instantly — no refresh required.',
  },
  {
    Icon: BellAlertIcon,
    title: 'Email Notifications',
    description: 'Automatic email alerts when a new snap is submitted or a comment is posted — so nothing falls through the cracks.',
  },
  {
    Icon: VideoCameraIcon,
    title: 'Screen Recording',
    description: 'Record up to 30 seconds of screen activity to capture bugs that are impossible to explain with a single screenshot.',
  },
  {
    Icon: HashtagIcon,
    title: 'Auto Snap Numbers',
    description: 'Every snap gets a unique sequential ID (#1, #2, ...) scoped to your account — easy to reference in conversations or tickets.',
  },
  {
    Icon: ArrowsUpDownIcon,
    title: 'Priority & Reordering',
    description: 'Set Low / Medium / High / Critical priority on any snap, and drag to reorder within columns to reflect what needs attention first.',
  },
  {
    Icon: CheckCircleIcon,
    title: 'Status Tracking',
    description: 'Move snaps through New → In Progress → Resolved → Archived. Staff and clients see status changes in real time.',
  },
];

const steps = [
  { num: '1', title: 'Connect Your Knack App', desc: 'Enter your App ID and API Key. We auto-discover your user role tables.' },
  { num: '2', title: 'Configure Roles & Widget', desc: 'Choose which roles can snap, set widget position and accent color.' },
  { num: '3', title: 'Paste 3 Lines of Code', desc: 'Drop the embed snippet in your Knack JavaScript area. Done.' },
  { num: '4', title: 'Users Start Snapping', desc: 'Role-matched users see the floating button and can submit visual feedback instantly.' },
];

export default function Home() {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState('');

  const handleContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setSendError('');
    try {
      const res = await fetch('https://us-central1-snap4knack2.cloudfunctions.net/contactForm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Server error');
      setSent(true);
    } catch {
      setSendError('Something went wrong. Please email us directly at info@finemountainconsulting.com');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SEO path="/home" />
      <WebsiteNav />

      {/* Hero */}
      <section className="bg-gradient-to-br from-[#192f52] to-blue-700 text-white py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <CameraIcon className="h-4 w-4" />
            Built for Knack Applications
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
            Visual Feedback &amp; Bug Capture<br />for Any Knack App
          </h1>
          <p className="mt-6 text-lg text-blue-100 max-w-2xl mx-auto">
            Add a role-gated screenshot widget to your Knack application in minutes. Capture screenshots, recordings, console logs, and annotations — then manage everything in a real-time Kanban board.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 bg-white text-[#192f52] font-semibold px-6 py-3 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Get Started Free
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
            <a
              href="#contact"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Contact Us
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900">Everything you need</h2>
          <p className="mt-3 text-center text-gray-500 max-w-2xl mx-auto">
            A complete visual feedback and bug-tracking system built specifically for Knack-powered applications.
          </p>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {features.map(({ Icon, title, description }) => (
              <div key={title} className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <div className="bg-blue-50 rounded-lg p-3 w-fit">
                  <Icon className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-900">{title}</h3>
                <p className="mt-2 text-sm text-gray-500">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900">Up and running in minutes</h2>
          <p className="mt-3 text-center text-gray-500 max-w-xl mx-auto">No changes to your Knack app required — just a small embed snippet.</p>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {steps.map(({ num, title, desc }) => (
              <div key={num} className="flex gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-full bg-[#192f52] text-white flex items-center justify-center font-bold text-lg">
                  {num}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{title}</h3>
                  <p className="mt-1 text-sm text-gray-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-20 px-4 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900">Get in Touch</h2>
          <p className="mt-3 text-center text-gray-500">
            Interested in Snap4Knack for your team? We'd love to hear from you.
          </p>

          {sent ? (
            <div className="mt-10 bg-green-50 border border-green-200 rounded-xl p-8 text-center">
              <CheckCircleIcon className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <p className="text-green-800 font-semibold text-lg">Message sent!</p>
              <p className="text-green-700 text-sm mt-1">We'll be in touch shortly.</p>
            </div>
          ) : (
            <form onSubmit={handleContact} className="mt-10 bg-white rounded-xl shadow-sm border border-gray-100 p-8 space-y-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                  <input
                    required
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    placeholder="Jane Smith"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    placeholder="jane@example.com"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company / Organization</label>
                <input
                  type="text"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message <span className="text-red-500">*</span></label>
                <textarea
                  required
                  rows={5}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="Tell us about your Knack setup and what you're looking for…"
                />
              </div>
              {sendError && <p className="text-sm text-red-600">{sendError}</p>}
              <button
                type="submit"
                disabled={sending}
                className="w-full inline-flex items-center justify-center gap-2 bg-[#192f52] hover:bg-blue-900 text-white font-semibold px-6 py-3 rounded-lg transition-colors disabled:opacity-60"
              >
                {sending ? 'Sending…' : 'Send Message'}
                {!sending && <ArrowRightIcon className="h-4 w-4" />}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-[#192f52]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white">Ready to get started?</h2>
          <p className="mt-3 text-blue-200">Sign in to your Snap4Knack account and connect your first Knack app.</p>
          <Link
            to="/login"
            className="mt-6 inline-flex items-center gap-2 bg-white text-[#192f52] font-semibold px-6 py-3 rounded-lg hover:bg-blue-50 transition-colors"
          >
            Sign In
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-10 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CameraIcon className="h-6 w-6 text-blue-400" />
            <span className="text-white font-semibold">Snap4Knack</span>
          </div>
          <p className="text-sm">© {new Date().getFullYear()} Fine Mountain Consulting LLC</p>
          <div className="flex gap-4 text-sm">
            <a href="#contact" className="hover:text-white transition-colors">Contact</a>
            <a href="/legal/privacy-policy" className="hover:text-white transition-colors">Privacy</a>
            <a href="/legal/terms-of-service" className="hover:text-white transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
