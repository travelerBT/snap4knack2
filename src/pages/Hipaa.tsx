import { Link } from 'react-router-dom';
import WebsiteNav from '../components/WebsiteNav';
import SEO from '../components/SEO';
import {
  ShieldCheckIcon,
  LockClosedIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  PhotoIcon,
  ClockIcon,
  EnvelopeIcon,
  EyeSlashIcon,
  ServerStackIcon,
  ExclamationTriangleIcon,
  CameraIcon,
} from '@heroicons/react/24/outline';

const protections = [
  {
    Icon: PhotoIcon,
    title: 'Automatic Image PHI Redaction',
    description:
      'Every screenshot captured by a HIPAA-enabled plugin is uploaded to a private staging area — never directly accessible. Google Cloud DLP scans the image with OCR, detects PHI regions (names, dates of birth, SSNs, medical record numbers, NPI numbers), and black-boxes them before the image is published. The card appears in your Kanban immediately; the clean image follows within seconds.',
  },
  {
    Icon: DocumentTextIcon,
    title: 'Text Field PHI Scrubbing',
    description:
      'Description fields submitted through a HIPAA-enabled widget are passed through Google Cloud DLP before being written to the database. Detected PHI tokens are replaced inline — e.g. "Patient John Smith" becomes "Patient [PERSON_NAME]" — while the rest of the text is preserved. Query string parameters (which may carry patient IDs or record numbers) are stripped from page URLs at submission time.',
  },
  {
    Icon: EnvelopeIcon,
    title: 'Sanitized Email Notifications',
    description:
      'Snap and comment notification emails sent for HIPAA plugins never include page URLs, screenshot thumbnails, or comment text. Recipients receive a secure notification with a direct link to log in and view details — keeping PHI inside the platform, not in inboxes.',
  },
  {
    Icon: EyeSlashIcon,
    title: 'Console Log Lockout',
    description:
      'Console log capture is automatically disabled for HIPAA-enabled plugins. Browser console output can contain session tokens, patient query results, or API responses with PHI — so the option is removed entirely from the widget UI.',
  },
  {
    Icon: ClockIcon,
    title: '7-Year Retention',
    description:
      'HIPAA-enabled plugins retain all snaps, comments, and associated metadata for a minimum of 2,555 days (7 years) — meeting the HIPAA records retention standard. Snaps are retained even after status changes to Resolved or Archived. A nightly purge cycle removes data only after its retention window has expired.',
  },
  {
    Icon: LockClosedIcon,
    title: 'Tenant-Scoped Storage Access',
    description:
      'Firebase Storage rules restrict screenshot and recording access to the owning tenant. No other authenticated user — including other Snap4Knack tenants — can read your files. The staging bucket used for PHI scanning is write-only from the client; only the Cloud Function can read it.',
  },
  {
    Icon: ServerStackIcon,
    title: 'GCP-Native Infrastructure',
    description:
      'Snap4Knack runs entirely on Google Cloud Platform — Firebase (Auth, Firestore, Storage, Functions) and Google Cloud DLP. All data is stored and processed within GCP, under Google\'s HIPAA-eligible infrastructure. No third-party data processors touch your content other than SendGrid for notifications (with no PHI in transit).',
  },
  {
    Icon: ExclamationTriangleIcon,
    title: 'PHI Warning in the Widget',
    description:
      'When a user opens the snap widget on a HIPAA-enabled plugin, a prominent yellow banner reminds them not to include patient names, dates of birth, SSNs, or any other protected health information in their submission description.',
  },
];

const checklist = [
  'Per-plugin HIPAA toggle — enable only where needed',
  'Google Cloud DLP image redaction (OCR-based)',
  'Google Cloud DLP text scrubbing on description fields',
  'Query-string stripping from page URLs',
  'Console log capture disabled',
  'Private staging bucket — images never public before scanning',
  'Sanitized email notifications (no PHI in transit)',
  'PHI warning banner in widget UI',
  '7-year data retention (2,555 days)',
  'Tenant-scoped Firebase Storage rules',
  'GCP HIPAA-eligible infrastructure',
  'BAA support (handled externally — contact us)',
];

export default function Hipaa() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SEO
        title="HIPAA Compliant Feedback for Healthcare Knack Apps"
        description="Snap4Knack's HIPAA mode enables healthcare organizations to collect visual feedback safely — with automatic PHI detection, image redaction, 7-year retention, and sanitized notifications."
        path="/hipaa"
      />
      <WebsiteNav />

      {/* Hero */}
      <section className="bg-gradient-to-br from-[#192f52] to-blue-700 text-white py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <ShieldCheckIcon className="h-4 w-4" />
            HIPAA Compliant
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
            Visual Feedback for<br className="hidden sm:block" /> Healthcare Knack Apps
          </h1>
          <p className="mt-6 text-lg text-blue-100 max-w-2xl mx-auto">
            Snap4Knack's HIPAA mode gives healthcare organizations the same powerful visual feedback tools — with automatic PHI detection, image redaction, and 7-year audit-ready retention built in.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/contact"
              className="inline-flex items-center gap-2 bg-white text-[#192f52] font-semibold px-6 py-3 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Talk to Us About HIPAA
              <ArrowRightIcon className="h-4 w-4" />
            </a>
            <Link
              to="/faq"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Read the FAQ
            </Link>
          </div>
        </div>
      </section>

      {/* How it works summary */}
      <section className="py-16 px-4 bg-green-50 border-y border-green-100">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-900">One toggle. Full protection.</h2>
          <p className="mt-3 text-gray-500 max-w-2xl mx-auto">
            Enable HIPAA mode on any Snap Plugin. Every snap submitted through that plugin is automatically scanned, scrubbed, and stored under HIPAA-grade controls — no extra configuration required.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-6 justify-center items-start">
            {[
              { step: '1', label: 'Enable HIPAA toggle', sub: 'Per plugin, in the creation wizard or settings' },
              { step: '2', label: 'Users submit snaps', sub: 'Widget shows PHI warning; console disabled' },
              { step: '3', label: 'DLP scans automatically', sub: 'Image redacted, text scrubbed before storage' },
              { step: '4', label: 'Card appears immediately', sub: 'Clean image follows within seconds' },
            ].map(({ step, label, sub }) => (
              <div key={step} className="flex-1 flex flex-col items-center gap-2">
                <div className="h-12 w-12 rounded-full bg-[#192f52] text-white flex items-center justify-center font-bold text-lg">
                  {step}
                </div>
                <p className="text-sm font-semibold text-gray-900 text-center">{label}</p>
                <p className="text-xs text-gray-500 text-center">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Protection details */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900">How each protection works</h2>
          <p className="mt-3 text-center text-gray-500 max-w-2xl mx-auto">
            Every layer addresses a specific HIPAA risk. Here's exactly what happens to a snap from a HIPAA-enabled plugin.
          </p>
          <div className="mt-12 space-y-6">
            {protections.map(({ Icon, title, description }) => (
              <div key={title} className="flex gap-5 bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
                <div className="flex-shrink-0 bg-blue-50 rounded-lg p-3 h-fit">
                  <Icon className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{title}</h3>
                  <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Checklist */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900">HIPAA feature checklist</h2>
          <p className="mt-3 text-center text-gray-500">Everything included with HIPAA mode — no add-ons, no extra tiers.</p>
          <div className="mt-10 bg-white border border-gray-100 rounded-xl shadow-sm p-8">
            <ul className="space-y-3">
              {checklist.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* DLP explainer */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900">Powered by Google Cloud DLP</h2>
          <p className="mt-3 text-center text-gray-500 max-w-2xl mx-auto">
            Snap4Knack uses Google Cloud Data Loss Prevention (DLP) — the same technology used by Google Workspace and GCP-native security tools.
          </p>
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              {
                title: 'OCR-based image scanning',
                body: 'DLP renders the screenshot and runs OCR to detect text. PHI regions — names, dates, SSNs, medical record numbers, NPI numbers, phone numbers, and email addresses — are replaced with black rectangles. The rest of the image is untouched.',
              },
              {
                title: 'Inline text redaction',
                body: 'Text fields are scanned at the token level. Only matched PHI is replaced with a type label like [PERSON_NAME] or [DATE_OF_BIRTH]. Surrounding context is preserved, so support teams can still understand the issue.',
              },
              {
                title: 'Partial — not full — blackout',
                body: "DLP identifies and redacts only the specific PHI regions it detects. The goal is to preserve as much useful diagnostic context as possible — your team can still see the app UI, the error message, and the layout that caused the issue.",
              },
              {
                title: 'Scoped to HIPAA plugins only',
                body: 'DLP scanning only runs for plugins with HIPAA mode enabled. Non-HIPAA plugins are completely unaffected — no scanning overhead, no latency, no cost impact.',
              },
            ].map(({ title, body }) => (
              <div key={title} className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                <p className="mt-2 text-sm text-gray-500 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BAA note */}
      <section className="py-16 px-4 bg-yellow-50 border-y border-yellow-100">
        <div className="max-w-3xl mx-auto flex gap-5 items-start">
          <DocumentTextIcon className="h-8 w-8 text-yellow-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="text-base font-semibold text-gray-900">Business Associate Agreements (BAAs)</h3>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">
              A BAA is required between your organization and any vendor that handles PHI on your behalf. Snap4Knack supports BAAs — please contact us before deploying HIPAA-enabled plugins so we can execute the agreement prior to any PHI entering the system.
            </p>
            <a
              href="/contact"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-yellow-700 hover:text-yellow-900"
            >
              Contact us about a BAA
              <ArrowRightIcon className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-[#192f52]">
        <div className="max-w-2xl mx-auto text-center">
          <ShieldCheckIcon className="h-12 w-12 text-blue-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white">Ready to deploy HIPAA-compliant feedback?</h2>
          <p className="mt-3 text-blue-200 text-sm max-w-lg mx-auto">
            Talk to us about your Knack setup, BAA requirements, and how Snap4Knack can fit into your healthcare workflow.
          </p>
          <a
            href="/contact"
            className="mt-8 inline-flex items-center gap-2 bg-white text-[#192f52] font-semibold px-6 py-3 rounded-lg hover:bg-blue-50 transition-colors"
          >
            Get in Touch
            <ArrowRightIcon className="h-4 w-4" />
          </a>
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
            <a href="/contact" className="hover:text-white transition-colors">Contact</a>
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
