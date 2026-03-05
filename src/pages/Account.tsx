import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { updatePassword, updateProfile, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db, auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/SEO';
import Modal from '../components/Modal';

export default function Account() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [notifyOnSnap, setNotifyOnSnap] = useState(true);
  const [notifyOnComment, setNotifyOnComment] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState({ open: false, type: 'success' as 'success' | 'error', title: '', message: '' });

  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, 'users', user.uid)).then((d) => {
      if (d.exists()) {
        const data = d.data();
        setNotifyOnSnap(data.notifyOnSnap ?? true);
        setNotifyOnComment(data.notifyOnComment ?? true);
      }
    });
  }, [user?.uid]);

  const saveProfile = async () => {
    if (!user || !auth.currentUser) return;
    setSaving(true);
    try {
      if (displayName !== user.displayName) {
        await updateProfile(auth.currentUser, { displayName });
        await updateDoc(doc(db, 'users', user.uid), { displayName });
      }
      setModal({ open: true, type: 'success', title: 'Profile updated', message: 'Your display name has been saved.' });
    } catch (err) {
      setModal({ open: true, type: 'error', title: 'Error', message: String(err) });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!user?.email || !currentPassword || !newPassword || !auth.currentUser) return;
    setSaving(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setModal({ open: true, type: 'success', title: 'Password changed', message: 'Your password has been updated.' });
    } catch (err) {
      setModal({ open: true, type: 'error', title: 'Error', message: String(err) });
    } finally {
      setSaving(false);
    }
  };

  const saveNotifications = async () => {
    if (!user?.uid) return;
    setSaving(true);
    await updateDoc(doc(db, 'users', user.uid), { notifyOnSnap, notifyOnComment });
    setSaving(false);
    setModal({ open: true, type: 'success', title: 'Preferences saved', message: 'Notification settings updated.' });
  };

  return (
    <div className="max-w-2xl">
      <SEO title="Account" />
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Account Settings</h1>

      {/* Profile */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Profile</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              type="email"
              disabled
              className="block w-full rounded-lg border-gray-300 bg-gray-50 shadow-sm sm:text-sm cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-gray-400">Email changes require re-authentication. Contact support.</p>
          </div>
          <button
            onClick={saveProfile}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* Password */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Change Password</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <input
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          <button
            onClick={changePassword}
            disabled={saving || !currentPassword || !newPassword}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Change Password'}
          </button>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Email Notifications</h2>
        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-gray-700">New snap submitted</span>
            <button
              role="switch"
              aria-checked={notifyOnSnap}
              onClick={() => setNotifyOnSnap((v) => !v)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                notifyOnSnap ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${notifyOnSnap ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-gray-700">New comment on a snap</span>
            <button
              role="switch"
              aria-checked={notifyOnComment}
              onClick={() => setNotifyOnComment((v) => !v)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                notifyOnComment ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${notifyOnComment ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </label>
        </div>
        <button
          onClick={saveNotifications}
          disabled={saving}
          className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Notifications'}
        </button>
      </div>

      <Modal open={modal.open} type={modal.type} title={modal.title} message={modal.message} onClose={() => setModal((m) => ({ ...m, open: false }))} />
    </div>
  );
}
