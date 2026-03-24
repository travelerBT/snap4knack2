import { useState } from 'react';
import { Link } from 'react-router-dom';
import WebsiteNav from '../components/WebsiteNav';
import SEO from '../components/SEO';
import { ArrowRightIcon, TagIcon } from '@heroicons/react/24/outline';
import { blogPosts, ALL_TAGS } from '../data/blogPosts';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

const TAG_COLORS: Record<string, string> = {
  'Release Notes': 'bg-blue-100 text-blue-700',
  'Product':       'bg-purple-100 text-purple-700',
  'Engineering':   'bg-green-100 text-green-700',
  'HIPAA':         'bg-red-100 text-red-700',
};

export default function Blog() {
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const filtered = activeTag
    ? blogPosts.filter(p => p.tags.includes(activeTag))
    : blogPosts;

  // Sort newest first
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <SEO
        title="Blog | Snap4Knack"
        description="Product updates, release notes, and engineering insights from the Snap4Knack team."
      />
      <WebsiteNav />

      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-50 to-white py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Blog</h1>
          <p className="text-lg text-gray-600">
            Product updates, release notes, and engineering insights from the Snap4Knack team.
          </p>
        </div>
      </section>

      {/* Tag filter */}
      <section className="border-b border-gray-200 bg-white sticky top-16 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2 overflow-x-auto">
          <TagIcon className="h-4 w-4 text-gray-400 shrink-0" />
          <button
            onClick={() => setActiveTag(null)}
            className={`shrink-0 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              activeTag === null
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            All
          </button>
          {ALL_TAGS.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={`shrink-0 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                activeTag === tag
                  ? 'bg-gray-900 text-white'
                  : `${TAG_COLORS[tag] ?? 'bg-gray-100 text-gray-700'} hover:opacity-80`
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </section>

      {/* Post list */}
      <main className="max-w-4xl mx-auto px-4 py-12 space-y-8">
        {sorted.length === 0 && (
          <p className="text-gray-500 text-center py-16">No posts in this category yet.</p>
        )}
        {sorted.map(post => (
          <article key={post.slug} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex flex-wrap gap-2 mb-3">
              {post.tags.map(tag => (
                <span key={tag} className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${TAG_COLORS[tag] ?? 'bg-gray-100 text-gray-700'}`}>
                  {tag}
                </span>
              ))}
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              <Link to={`/blog/${post.slug}`} className="hover:text-blue-600 transition-colors">
                {post.title}
              </Link>
            </h2>
            <p className="text-sm text-gray-400 mb-3">{formatDate(post.date)}</p>
            <p className="text-gray-600 text-sm leading-relaxed mb-4">{post.summary}</p>
            <Link
              to={`/blog/${post.slug}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Read more <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </article>
        ))}
      </main>

      {/* Footer CTA */}
      <section className="bg-blue-600 text-white py-16 px-4 text-center">
        <h2 className="text-2xl font-bold mb-3">Ready to try Snap4Knack?</h2>
        <p className="text-blue-100 mb-6">Get set up in minutes — no Knack schema changes required.</p>
        <Link
          to="/contact"
          className="inline-flex items-center gap-2 bg-white text-blue-600 font-semibold px-6 py-3 rounded-xl hover:bg-blue-50 transition-colors"
        >
          Get in touch <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </section>
    </>
  );
}
