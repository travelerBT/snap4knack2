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
  ShieldCheckIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';

// hipaa: 'yes' = fully available, 'modified' = available with restrictions, 'no' = not available
const features: { Icon: React.ElementType; title: string; description: string; hipaa: 'yes' | 'modified' | 'no'; hipaaNote?: string }[] = [
  {
    Icon: CameraIcon,
    title: 'Multi-Mode Capture',
    description: 'Full page, select area, pin element, or screen recording up to 30 seconds — users pick the right tool for the job.',
    hipaa: 'modified',
    hipaaNote: 'Screen recording disabled in HIPAA mode',
  },
  {
    Icon: PencilSquareIcon,
    title: 'Annotation Tools',
    description: 'Freehand pen, rectangles, arrows, text labels, and blur/redact — annotate directly on the screenshot before submitting.',
    hipaa: 'yes',
  },
  {
    Icon: CommandLineIcon,
    title: 'Console Output Capture',
    description: 'Optionally attach the full browser console (all log levels + unhandled errors) with every snap — no DevTools needed.',
    hipaa: 'no',
    hipaaNote: 'Disabled in HIPAA mode — console logs may contain PHI',
  },
  {
    Icon: UserGroupIcon,
    title: 'Role-Based Widget',
    description: 'The floating widget is gated to specific Knack user roles. Everyone else never sees it.',
    hipaa: 'yes',
  },
  {
    Icon: Squares2X2Icon,
    title: 'Kanban + Drag & Drop',
    description: 'Real-time Kanban board across New, In Progress, Resolved, and Archived. Drag cards between columns or reorder within a column.',
    hipaa: 'yes',
  },
  {
    Icon: UserGroupIcon,
    title: 'Client Portal',
    description: 'Invite clients with a one-click link. They get their own real-time portal — same Kanban view, same annotations, no login friction.',
    hipaa: 'yes',
  },
  {
    Icon: ChatBubbleLeftEllipsisIcon,
    title: 'Threaded Comments',
    description: 'Staff and clients can discuss any snap with threaded comments. New posts appear instantly — no refresh required.',
    hipaa: 'yes',
  },
  {
    Icon: BellAlertIcon,
    title: 'Email Notifications',
    description: 'Automatic email alerts when a new snap is submitted or a comment is posted — so nothing falls through the cracks.',
    hipaa: 'modified',
    hipaaNote: 'PHI stripped from notifications in HIPAA mode',
  },
  {
    Icon: VideoCameraIcon,
    title: 'Screen Recording',
    description: 'Record up to 30 seconds of screen activity to capture bugs that are impossible to explain with a single screenshot.',
    hipaa: 'no',
    hipaaNote: 'Not available in HIPAA mode',
  },
  {
    Icon: HashtagIcon,
    title: 'Auto Snap Numbers',
    description: 'Every snap gets a unique sequential ID (#1, #2, ...) scoped to your account — easy to reference in conversations or tickets.',
    hipaa: 'yes',
  },
  {
    Icon: ArrowsUpDownIcon,
    title: 'Priority & Reordering',
    description: 'Set Low / Medium / High / Critical priority on any snap, and drag to reorder within columns to reflect what needs attention first.',
    hipaa: 'yes',
  },
  {
    Icon: CheckCircleIcon,
    title: 'Status Tracking',
    description: 'Move snaps through New → In Progress → Resolved → Archived. Staff and clients see status changes in real time.',
    hipaa: 'yes',
  },
];

const steps = [
  { num: '1', title: 'Connect Your Knack App', desc: 'Enter your App ID and API Key. We auto-discover your user role tables.' },
  { num: '2', title: 'Configure Roles & Widget', desc: 'Choose which roles can snap, set widget position and accent color.' },
  { num: '3', title: 'Paste 3 Lines of Code', desc: 'Drop the embed snippet in your Knack JavaScript area. Done.' },
  { num: '4', title: 'Users Start Snapping', desc: 'Role-matched users see the floating button and can submit visual feedback instantly.' },
];

const CACHE_BUST = '?v=3';

const screenshots = [
  {
    src: `/screenshots/snap-feed.png${CACHE_BUST}`,
    label: 'Kanban Board',
    caption: 'Real-time Kanban — drag cards between New, In Progress, Resolved, and Archived.',
  },
  {
    src: `/screenshots/dashboard.png${CACHE_BUST}`,
    label: 'Dashboard',
    caption: 'At-a-glance stats across all your connections and plugins.',
  },
  {
    src: `/screenshots/connections.png${CACHE_BUST}`,
    label: 'Connections',
    caption: 'Connect any number of Knack apps — each gets its own isolated feed.',
  },
  {
    src: `/screenshots/snap-plugins.png${CACHE_BUST}`,
    label: 'Snap Plugins',
    caption: 'Configure widget position, accent color, and role restrictions per plugin.',
  },
];

function ProductScreenshots() {
  const [active, setActive] = useState(0);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const current = screenshots[active];
  const hasError = errors[current.src];

  return (
    <section className="py-20 px-4 bg-white overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-gray-900">See it in action</h2>
        <p className="mt-3 text-center text-gray-500 max-w-2xl mx-auto">
          A complete bug-tracking and visual-feedback workflow — right inside your Knack app.
        </p>

        {/* Tab strip */}
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {screenshots.map((s, i) => (
            <button
              key={s.label}
              onClick={() => setActive(i)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                i === active
                  ? 'bg-[#192f52] text-white shadow'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Screenshot frame */}
        <div className="mt-8 rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-gray-900">
          {/* Fake browser chrome */}
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-800 border-b border-gray-700">
            <span className="h-3 w-3 rounded-full bg-red-500" />
            <span className="h-3 w-3 rounded-full bg-yellow-400" />
            <span className="h-3 w-3 rounded-full bg-green-500" />
            <div className="ml-4 flex-1 bg-gray-700 rounded-md px-3 py-1 text-xs text-gray-400 truncate max-w-sm">
              app.snap4knack.com
            </div>
          </div>
          {/* Image */}
          <div className="aspect-[16/9] bg-gray-100 flex items-center justify-center">
            {hasError ? (
              <div className="flex flex-col items-center justify-center text-gray-400">
                <CameraIcon className="h-12 w-12 mb-3" />
                <p className="text-sm font-medium">Screenshot coming soon</p>
              </div>
            ) : (
              <img
                src={current.src}
                alt={current.label}
                className="w-full h-full object-cover object-top"
                onError={() => setErrors((prev) => ({ ...prev, [current.src]: true }))}
              />
            )}
          </div>
        </div>

        {/* Caption */}
        <p className="mt-4 text-center text-sm text-gray-500">{current.caption}</p>
      </div>
    </section>
  );
}

export default function Home() {
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
              to="/contact"
              className="inline-flex items-center gap-2 bg-white text-[#192f52] font-semibold px-6 py-3 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Get in Touch
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Product Screenshots */}
      <ProductScreenshots />

      {/* Features */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900">Everything you need</h2>
          <p className="mt-3 text-center text-gray-500 max-w-2xl mx-auto">
            A complete visual feedback and bug-tracking system built specifically for Knack-powered applications.
          </p>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {features.map(({ Icon, title, description, hipaa, hipaaNote }) => (
              <div key={title} className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex flex-col">
                <div className="bg-blue-50 rounded-lg p-3 w-fit">
                  <Icon className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-900">{title}</h3>
                <p className="mt-2 text-sm text-gray-500 flex-1">{description}</p>
                <div className="mt-4">
                  {hipaa === 'yes' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                      <ShieldCheckIcon className="h-3.5 w-3.5" />
                      HIPAA Ready
                    </span>
                  )}
                  {hipaa === 'modified' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20" title={hipaaNote}>
                      <ShieldCheckIcon className="h-3.5 w-3.5" />
                      {hipaaNote ?? 'HIPAA (with restrictions)'}
                    </span>
                  )}
                  {hipaa === 'no' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 ring-1 ring-inset ring-red-600/20" title={hipaaNote}>
                      <XCircleIcon className="h-3.5 w-3.5" />
                      {hipaaNote ?? 'Not available in HIPAA mode'}
                    </span>
                  )}
                </div>
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

      {/* HIPAA teaser */}
      <section className="py-20 px-4 bg-[#192f52]">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 text-sm font-medium text-blue-200 mb-5">
                <ShieldCheckIcon className="h-4 w-4" />
                Built for Healthcare
              </div>
              <h2 className="text-3xl font-bold text-white">HIPAA-compliant feedback for healthcare Knack apps</h2>
              <p className="mt-4 text-blue-200 leading-relaxed">
                Enable HIPAA mode on any plugin. Screenshots are held in a private staging area, scanned by Google Cloud DLP, and PHI is automatically redacted before the image is stored. Console logs are disabled, email notifications are sanitized, and all data is retained for the required 7 years.
              </p>
              <Link
                to="/hipaa"
                className="mt-8 inline-flex items-center gap-2 bg-white text-[#192f52] font-semibold px-6 py-3 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Learn about HIPAA mode
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
              {[
                { label: 'DLP image redaction', sub: 'PHI regions black-boxed via OCR' },
                { label: 'Text PHI scrubbing', sub: 'Description fields sanitized before storage' },
                { label: '7-year retention', sub: 'HIPAA records retention built in' },
                { label: 'Staging quarantine', sub: 'Images private until DLP scan completes' },
                { label: 'Console lockout', sub: 'No sensitive logs captured or stored' },
                { label: 'Sanitized emails', sub: 'Notifications never contain PHI' },
              ].map(({ label, sub }) => (
                <div key={label} className="flex items-start gap-3 bg-white/10 rounded-xl p-4">
                  <CheckCircleIcon className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="text-xs text-blue-300 mt-0.5">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-[#192f52]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white">Ready to get started?</h2>
          <p className="mt-3 text-blue-200">Get in touch and we'll set up your account.</p>
          <Link
            to="/contact"
            className="mt-6 inline-flex items-center gap-2 bg-white text-[#192f52] font-semibold px-6 py-3 rounded-lg hover:bg-blue-50 transition-colors"
          >
            Contact Us
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
            <Link to="/contact" className="hover:text-white transition-colors">Contact</Link>
            <Link to="/faq" className="hover:text-white transition-colors">FAQ</Link>
            <Link to="/hipaa" className="hover:text-white transition-colors">HIPAA</Link>
            <a href="/legal/privacy-policy" className="hover:text-white transition-colors">Privacy</a>
            <a href="/legal/terms-of-service" className="hover:text-white transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
