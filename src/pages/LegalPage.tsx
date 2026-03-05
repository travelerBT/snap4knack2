import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import WebsiteNav from '../components/WebsiteNav';
import SEO from '../components/SEO';

const PAGE_TITLES: Record<string, string> = {
  'privacy-policy': 'Privacy Policy',
  'terms-of-service': 'Terms of Service',
};

export default function LegalPage() {
  const { page } = useParams<{ page: string }>();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const title = PAGE_TITLES[page || ''] || 'Legal';

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`/legal/${page}.md`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.text();
      })
      .then((text) => setContent(text))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="min-h-screen bg-white">
      <SEO title={title} path={`/legal/${page}`} />
      <WebsiteNav />
      <main className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">{title}</h1>
        {loading && <p className="text-gray-400">Loading…</p>}
        {error && (
          <div className="text-gray-500">
            <p>Page not found.</p>
            <Link to="/home" className="text-blue-600 hover:underline mt-4 inline-block">← Back to home</Link>
          </div>
        )}
        {!loading && !error && (
          <div className="prose prose-gray max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </main>
    </div>
  );
}
