import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { XMarkIcon } from '@heroicons/react/24/outline';

export default function TermsAgreementBanner() {
  const { tosAccepted, acceptTerms } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (tosAccepted || dismissed) return null;

  const handleAccept = async () => {
    setLoading(true);
    try {
      await acceptTerms();
      setDismissed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-blue-600 text-white px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <p className="text-sm">
          By using Snap4Knack, you agree to our{' '}
          <a href="/legal/terms-of-service" className="underline font-medium">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/legal/privacy-policy" className="underline font-medium">
            Privacy Policy
          </a>
          .
        </p>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={handleAccept}
            disabled={loading}
            className="bg-white text-blue-600 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'I Agree'}
          </button>
          <button onClick={() => setDismissed(true)} className="text-white/70 hover:text-white">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
