import { Link, useParams, Navigate } from 'react-router-dom';
import WebsiteNav from '../components/WebsiteNav';
import SEO from '../components/SEO';
import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { blogPosts, BlogSection } from '../data/blogPosts';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

const TAG_COLORS: Record<string, string> = {
  'Release Notes': 'bg-blue-100 text-blue-700',
  'Product':       'bg-purple-100 text-purple-700',
  'Engineering':   'bg-green-100 text-green-700',
  'HIPAA':         'bg-red-100 text-red-700',
  'AI Agent':      'bg-amber-100 text-amber-700',
};

const CALLOUT_STYLES: Record<string, string> = {
  info:    'bg-blue-50 border-blue-300 text-blue-800',
  success: 'bg-green-50 border-green-300 text-green-800',
  warning: 'bg-amber-50 border-amber-300 text-amber-800',
};

function RenderSection({ section }: { section: BlogSection }) {
  switch (section.type) {
    case 'h2':
      return <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">{section.text}</h2>;
    case 'h3':
      return <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-2">{section.text}</h3>;
    case 'paragraph':
      return <p className="text-gray-700 leading-relaxed">{section.text}</p>;
    case 'ul':
      return (
        <ul className="list-disc list-outside ml-5 space-y-2 text-gray-700">
          {section.items?.map((item, i) => <li key={i} className="leading-relaxed">{item}</li>)}
        </ul>
      );
    case 'ol':
      return (
        <ol className="list-decimal list-outside ml-5 space-y-2 text-gray-700">
          {section.items?.map((item, i) => <li key={i} className="leading-relaxed">{item}</li>)}
        </ol>
      );
    case 'callout': {
      const style = CALLOUT_STYLES[section.variant ?? 'info'];
      return (
        <div className={`border-l-4 rounded-r-lg px-4 py-3 text-sm leading-relaxed ${style}`}>
          {section.text}
        </div>
      );
    }
    case 'divider':
      return <hr className="border-gray-200 my-2" />;
    default:
      return null;
  }
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = blogPosts.find(p => p.slug === slug);

  if (!post) return <Navigate to="/blog" replace />;

  const sorted = [...blogPosts].sort((a, b) => b.date.localeCompare(a.date));
  const idx = sorted.findIndex(p => p.slug === slug);
  const prev = sorted[idx + 1] ?? null;
  const next = sorted[idx - 1] ?? null;

  return (
    <>
      <SEO
        title={`${post.title} | Snap4Knack Blog`}
        description={post.summary}
      />
      <WebsiteNav />

      <main className="max-w-3xl mx-auto px-4 py-12">
        {/* Back link */}
        <Link to="/blog" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-8">
          <ArrowLeftIcon className="h-4 w-4" /> All posts
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2 mb-4">
            {post.tags.map(tag => (
              <span key={tag} className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${TAG_COLORS[tag] ?? 'bg-gray-100 text-gray-700'}`}>
                {tag}
              </span>
            ))}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{post.title}</h1>
          <p className="text-sm text-gray-400">{formatDate(post.date)}</p>
        </div>

        {/* Lead summary */}
        <p className="text-lg text-gray-600 leading-relaxed mb-8 pb-8 border-b border-gray-200">
          {post.summary}
        </p>

        {/* Body */}
        <div className="space-y-5">
          {post.content.map((section, i) => (
            <RenderSection key={i} section={section} />
          ))}
        </div>

        {/* Prev / Next */}
        {(prev || next) && (
          <div className="mt-16 pt-8 border-t border-gray-200 flex justify-between gap-4">
            {prev ? (
              <Link to={`/blog/${prev.slug}`} className="group flex-1 text-left">
                <p className="text-xs text-gray-400 mb-1">← Older</p>
                <p className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">{prev.title}</p>
              </Link>
            ) : <div className="flex-1" />}
            {next ? (
              <Link to={`/blog/${next.slug}`} className="group flex-1 text-right">
                <p className="text-xs text-gray-400 mb-1">Newer →</p>
                <p className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">{next.title}</p>
              </Link>
            ) : <div className="flex-1" />}
          </div>
        )}

        {/* Footer CTA */}
        <div className="mt-16 bg-blue-600 text-white rounded-2xl p-8 text-center">
          <h2 className="text-xl font-bold mb-2">Ready to try Snap4Knack?</h2>
          <p className="text-blue-100 text-sm mb-5">Get set up in minutes — no Knack schema changes required.</p>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 bg-white text-blue-600 font-semibold px-5 py-2.5 rounded-xl hover:bg-blue-50 transition-colors text-sm"
          >
            Get in touch <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </>
  );
}
