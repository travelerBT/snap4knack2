import { useState } from 'react';
import { Link } from 'react-router-dom';
import WebsiteNav from '../components/WebsiteNav';
import SEO from '../components/SEO';
import { ChevronDownIcon, CameraIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

const faqs: { category: string; items: { q: string; a: string | React.ReactNode }[] }[] = [
  {
    category: 'General',
    items: [
      {
        q: 'What is Snap4Knack?',
        a: 'Snap4Knack is a visual feedback and bug-tracking tool built specifically for Knack-powered applications. It adds a floating widget to your Knack app that lets role-gated users capture screenshots, screen recordings, and console logs — then manage all that feedback in a real-time Kanban board.',
      },
      {
        q: 'Do I need to modify my Knack app to use Snap4Knack?',
        a: 'No changes to your Knack schema are required. You just paste a small JavaScript snippet into the Knack JavaScript area of your app. That\'s it.',
      },
      {
        q: 'Who is Snap4Knack for?',
        a: 'Snap4Knack is for Knack developers, consultants, and agencies who want a fast, structured way to collect visual bug reports and feedback from end users or clients — without relying on email or Slack screenshots.',
      },
      {
        q: 'How do I get an account?',
        a: (
          <>
            Accounts are set up manually by our team. <Link to="/home#contact" className="text-blue-600 hover:underline">Get in touch</Link> and we'll have you up and running quickly.
          </>
        ),
      },
    ],
  },
  {
    category: 'The Widget',
    items: [
      {
        q: 'What capture modes does the widget support?',
        a: 'The widget supports four capture modes: Full Page screenshot, Select Area (crop), Pin Element (click to highlight a specific element), and Screen Recording (up to 30 seconds with audio).',
      },
      {
        q: 'Can users annotate screenshots before submitting?',
        a: 'Yes. The widget has a built-in annotation toolbar with freehand pen, rectangles, arrows, text labels, and a blur/redact tool for hiding sensitive information.',
      },
      {
        q: 'Can I restrict the widget to specific Knack user roles?',
        a: 'Absolutely — that\'s a core feature. You configure which Knack user roles can see and use the widget. Everyone else never sees the button.',
      },
      {
        q: 'Can I customize the look of the widget?',
        a: 'Yes. You can configure the widget\'s position on the screen (bottom-left, bottom-right, etc.) and set a custom accent color to match your app\'s branding.',
      },
      {
        q: 'Does the widget capture browser console logs?',
        a: 'Yes, optionally. You can configure the widget to automatically attach the full browser console output — all log levels plus unhandled errors — with every snap. No DevTools needed.',
      },
    ],
  },
  {
    category: 'Managing Feedback',
    items: [
      {
        q: 'How is feedback organized?',
        a: 'Every submission (called a "snap") is assigned a unique sequential number and flows into a real-time Kanban board with four columns: New, In Progress, Resolved, and Archived. You can drag cards between columns or reorder within a column.',
      },
      {
        q: 'Can I filter and search snaps?',
        a: 'Yes. The Snap Feed has filters for connection, status, capture type, and priority. There\'s also a full-text search across snap content.',
      },
      {
        q: 'What is a "Connection"?',
        a: 'A Connection is a linked Knack application. You enter the Knack App ID and API Key, and Snap4Knack auto-discovers your user role tables. Each Connection has its own isolated snap feed.',
      },
      {
        q: 'What is a "Snap Plugin"?',
        a: 'A Snap Plugin is the widget configuration tied to a specific Connection. It controls which roles see the widget, its position, accent color, and generates the embed code you paste into Knack.',
      },
      {
        q: 'Can I set priority levels on snaps?',
        a: 'Yes. Each snap can be assigned a priority of Low, Medium, High, or Critical. You can also manually reorder snaps within a Kanban column to reflect what needs attention first.',
      },
    ],
  },
  {
    category: 'Client Portal',
    items: [
      {
        q: 'What is the Client Portal?',
        a: 'The Client Portal is a shared view you can give to your clients. They get their own real-time Kanban board showing all snaps for their project — same annotations, same status updates — without needing a full Snap4Knack account.',
      },
      {
        q: 'How do I invite a client?',
        a: 'From the Connection Details page, you can generate a one-click invite link. Your client clicks it, enters their name and email, and they\'re in — no password required.',
      },
      {
        q: 'Can clients comment on snaps?',
        a: 'Yes. Both staff and clients can leave threaded comments on any snap. New comments appear in real time for everyone viewing that snap.',
      },
    ],
  },
  {
    category: 'Notifications',
    items: [
      {
        q: 'Will I be notified when a new snap is submitted?',
        a: 'Yes. Snap4Knack sends automatic email notifications when a new snap is submitted and when a comment is posted on a snap, so nothing falls through the cracks.',
      },
      {
        q: 'Who receives notification emails?',
        a: 'Email notifications go to the account owner and any team members configured on the connection. Clients also receive comment notifications on snaps they\'re involved in.',
      },
    ],
  },
  {
    category: 'Security & Privacy',
    items: [
      {
        q: 'Where is my data stored?',
        a: 'All data is stored securely on Google Firebase (Firestore and Cloud Storage), hosted in the United States. Screenshots and recordings are stored in Firebase Storage with strict access rules.',
      },
      {
        q: 'Can users accidentally capture sensitive data?',
        a: 'The widget\'s blur/redact annotation tool lets users hide sensitive information before submitting. You can also instruct users to use Select Area capture mode to limit what\'s captured.',
      },
      {
        q: 'Is my Knack API key secure?',
        a: 'Your Knack API key is stored encrypted in Firestore and is never exposed in the widget embed code. The embed code only contains your Snap4Knack plugin ID.',
      },
    ],
  },
];

function FAQItem({ q, a }: { q: string; a: string | React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-200 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-base font-medium text-gray-900">{q}</span>
        <ChevronDownIcon
          className={`h-5 w-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="pb-5 text-sm text-gray-600 leading-relaxed pr-8">
          {a}
        </div>
      )}
    </div>
  );
}

export default function FAQ() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SEO title="FAQ" path="/faq" />
      <WebsiteNav />

      {/* Hero */}
      <section className="bg-gradient-to-br from-[#192f52] to-blue-700 text-white py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl font-bold">Frequently Asked Questions</h1>
          <p className="mt-4 text-blue-100 text-lg">
            Everything you need to know about Snap4Knack.
          </p>
        </div>
      </section>

      {/* FAQ Content */}
      <section className="py-16 px-4 flex-1">
        <div className="max-w-3xl mx-auto space-y-12">
          {faqs.map(({ category, items }) => (
            <div key={category}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-4">
                {category}
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6">
                {items.map(({ q, a }) => (
                  <FAQItem key={q} q={q} a={a} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Still have questions CTA */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-900">Still have questions?</h2>
          <p className="mt-3 text-gray-500">
            We're happy to walk you through how Snap4Knack fits your specific setup.
          </p>
          <Link
            to="/home#contact"
            className="mt-6 inline-flex items-center gap-2 bg-[#192f52] hover:bg-blue-900 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Get in Touch
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
            <Link to="/home#contact" className="hover:text-white transition-colors">Contact</Link>
            <Link to="/faq" className="hover:text-white transition-colors">FAQ</Link>
            <a href="/legal/privacy-policy" className="hover:text-white transition-colors">Privacy</a>
            <a href="/legal/terms-of-service" className="hover:text-white transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
