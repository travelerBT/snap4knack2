import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/SEO';
import { CameraIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

type Mode = 'login' | 'forgot';

export default function Login() {
  const { login, resetPassword } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        navigate('/dashboard');
      } else {
        await resetPassword(email);
        setSuccess('Password reset email sent. Check your inbox.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred.';
      setError(getFirebaseErrorMessage(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <SEO
        title={mode === 'login' ? 'Sign In' : 'Reset Password'}
        path="/login"
      />

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="bg-blue-600 rounded-xl p-3">
            <CameraIcon className="h-8 w-8 text-white" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-bold text-gray-900">
          {mode === 'login' ? 'Sign in to Snap4Knack' : 'Reset your password'}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow rounded-xl sm:px-10">
          {error && (
            <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              <ExclamationCircleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
              {success}
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

            {mode === 'login' && (
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
              </div>
            )}

            {mode === 'login' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Send reset email'}
            </button>
          </form>

          {mode === 'forgot' && (
            <div className="mt-6 text-center text-sm">
              <button onClick={() => setMode('login')} className="text-blue-600 hover:text-blue-700 font-medium">
                Back to sign in
              </button>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          By signing in you agree to our{' '}
          <Link to="/legal/terms-of-service" className="underline">Terms of Service</Link>
          {' '}and{' '}
          <Link to="/legal/privacy-policy" className="underline">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}

function getFirebaseErrorMessage(msg: string): string {
  if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) {
    return 'Invalid email or password.';
  }
  if (msg.includes('weak-password')) return 'Password must be at least 6 characters.';
  if (msg.includes('invalid-email')) return 'Please enter a valid email address.';
  if (msg.includes('too-many-requests')) return 'Too many attempts. Please try again later.';
  return 'Something went wrong. Please try again.';
}
