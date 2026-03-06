import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase';
import SEO from '../components/SEO';
import { CameraIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

type Mode = 'signup' | 'login';

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const invitationId = params.get('id') || '';

  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isValidLink = !!token && !!invitationId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Step 1: create or sign in Firebase Auth account
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }

      // Step 2: accept the invitation (grants client role + plugin access in Firestore)
      const acceptInvitation = httpsCallable(functions, 'acceptInvitation');
      await acceptInvitation({ token, invitationId });

      // Step 3: force full page reload so AuthContext re-reads the updated roles from Firestore
      window.location.href = '/client-portal';
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(getErrorMessage(msg));
    }
  };

  if (!isValidLink) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="text-center">
          <div className="bg-red-100 rounded-full p-4 inline-flex mb-4">
            <ExclamationCircleIcon className="h-10 w-10 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Invalid invitation link</h2>
          <p className="mt-2 text-sm text-gray-500">
            This invitation link is missing required information. Please check the link in your email and try again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <SEO title="Accept Invitation" path="/accept-invite" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="bg-blue-600 rounded-xl p-3">
            <CameraIcon className="h-8 w-8 text-white" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-bold text-gray-900">
          You've been invited to Snap4Knack
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500">
          {mode === 'signup'
            ? 'Create your account to access the client portal.'
            : 'Sign in to accept your invitation.'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow rounded-xl sm:px-10">
          {error && (
            <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              <ExclamationCircleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="••••••••"
                minLength={6}
              />
              {mode === 'signup' && (
                <p className="mt-1 text-xs text-gray-400">Minimum 6 characters.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
            >
              {loading
                ? 'Setting up your account…'
                : mode === 'signup'
                ? 'Create account & access portal'
                : 'Sign in & access portal'}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-gray-500">
            {mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => { setMode('login'); setError(''); }}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <button
                  onClick={() => { setMode('signup'); setError(''); }}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Sign up
                </button>
              </>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Your account will only have access to the portal views shared with you.
        </p>
      </div>
    </div>
  );
}

function getErrorMessage(msg: string): string {
  if (msg.includes('email-already-in-use')) return 'An account with this email already exists. Try signing in instead.';
  if (msg.includes('user-not-found')) return 'No account found with this email.';
  if (msg.includes('wrong-password') || msg.includes('invalid-credential')) return 'Incorrect email or password.';
  if (msg.includes('weak-password')) return 'Password must be at least 6 characters.';
  if (msg.includes('invalid-email')) return 'Please enter a valid email address.';
  if (msg.includes('already-exists')) return 'This invitation has already been accepted.';
  if (msg.includes('deadline-exceeded')) return 'This invitation has expired.';
  if (msg.includes('not-found')) return 'Invitation not found. Please check your invite link.';
  if (msg.includes('permission-denied')) return 'The email you entered does not match this invitation.';
  if (msg.includes('too-many-requests')) return 'Too many attempts. Please try again later.';
  return msg;
}
