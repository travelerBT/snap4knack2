import { Link } from 'react-router-dom';
import WebsiteNav from '../components/WebsiteNav';
import SEO from '../components/SEO';
import {
  CameraIcon,
  PencilSquareIcon,
  UserGroupIcon,
  ChartBarIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

const features = [
  {
    Icon: CameraIcon,
    title: 'Multi-Mode Capture',
    description:
      'Full viewport, selected area, element pin, or screen recording — users choose the best way to capture their issue.',
  },
  {
    Icon: PencilSquareIcon,
    title: 'Annotation Tools',
    description:
      'Freehand pen, rectangles, arrows, text pins, and blur/redact — everything needed to clearly communicate what\'s wrong.',
  },
  {
    Icon: UserGroupIcon,
    title: 'Role-Based Access',
    description:
      'Configure exactly which Knack user roles can see and use the widget. Other roles never see it.',
  },
  {
    Icon: ChartBarIcon,
    title: 'Client Portal',
    description:
      'Invite clients to view, comment on, and track the status of their submitted snaps in a dedicated portal.',
  },
];

const steps = [
  { num: '1', title: 'Connect Your Knack App', desc: 'Enter your App ID and API Key. We auto-discover your user role tables.' },
  { num: '2', title: 'Configure Roles & Widget', desc: 'Choose which roles can snap and customize the widget appearance.' },
  { num: '3', title: 'Paste 3 Lines of Code', desc: 'Drop the embed snippet in your Knack JavaScript area. Done.' },
  { num: '4', title: 'Users Start Snapping', desc: 'Role-matched users see the floating camera button and can submit feedback instantly.' },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SEO path="/home" />
      <WebsiteNav />

      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-700 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <CameraIcon className="h-4 w-4" />
            Built for Knack Applications
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
            Visual Feedback for<br />Any Knack App
          </h1>
          <p className="mt-6 text-lg text-blue-100 max-w-2xl mx-auto">
            Add role-gated screenshot capture, annotation, and feedback collection to your Knack applications — no code changes required for end users.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 bg-white text-blue-700 font-semibold px-6 py-3 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Get Started
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900">Everything you need</h2>
          <p className="mt-3 text-center text-gray-500 max-w-2xl mx-auto">
            A complete visual feedback system built specifically for Knack-powered applications.
          </p>
          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {steps.map(({ num, title, desc }) => (
              <div key={num} className="flex gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg">
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

      {/* CTA */}
      <section className="py-16 px-4 bg-blue-600">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white">Ready to get started?</h2>
          <p className="mt-3 text-blue-100">Sign in to your Snap4Knack account and connect your first Knack app.</p>
          <Link
            to="/login"
            className="mt-6 inline-flex items-center gap-2 bg-white text-blue-700 font-semibold px-6 py-3 rounded-lg hover:bg-blue-50 transition-colors"
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
            <a href="/legal/privacy-policy" className="hover:text-white transition-colors">Privacy</a>
            <a href="/legal/terms-of-service" className="hover:text-white transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
