import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/SEO';
import {
  CameraIcon,
  PlusIcon,
  ChevronRightIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import type { Connection, SnapPlugin, KnackRole } from '../types';
import { DEFAULT_SNAP_SETTINGS, DEFAULT_BRANDING, DEFAULT_CATEGORIES } from '../config/constants';

type WizardStep = 1 | 2 | 3 | 4;

function StepIndicator({ current, total }: { current: WizardStep; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <div key={n} className="flex items-center">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
            n < current ? 'bg-blue-600 text-white' :
            n === current ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
            'bg-gray-200 text-gray-500'
          }`}>
            {n < current ? <CheckCircleIcon className="h-5 w-5" /> : n}
          </div>
          {n < total && <div className={`w-8 h-0.5 mx-1 ${n < current ? 'bg-blue-600' : 'bg-gray-200'}`} />}
        </div>
      ))}
    </div>
  );
}

export default function SnapPlugins() {
  const { user } = useAuth();
  const tenantId = user?.uid || '';
  const navigate = useNavigate();

  const [plugins, setPlugins] = useState<SnapPlugin[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Wizard state
  const [step, setStep] = useState<WizardStep>(1);
  const [appType, setAppType] = useState<'knack' | 'react'>('knack');
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [pluginName, setPluginName] = useState('');
  const [allowRecording, setAllowRecording] = useState(false);
  const [hipaaEnabled, setHipaaEnabled] = useState(false);
  const [categories, setCategories] = useState<string[]>([...DEFAULT_CATEGORIES]);
  const [notifyEmails, setNotifyEmails] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedConnection = connections.find((c) => c.id === selectedConnectionId);

  useEffect(() => {
    if (!tenantId) return;
    Promise.all([
      getDocs(collection(db, 'tenants', tenantId, 'snapPlugins')),
      getDocs(collection(db, 'tenants', tenantId, 'connections')),
    ]).then(([pSnap, cSnap]) => {
      setPlugins(pSnap.docs.map((d) => ({ id: d.id, ...d.data() } as SnapPlugin)));
      setConnections(cSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Connection)));
    }).finally(() => setLoading(false));
  }, [tenantId]);

  const openWizard = () => {
    setStep(1);
    setAppType('knack');
    setSelectedConnectionId('');
    setSelectedRoles([]);
    setPluginName('');
    setAllowRecording(false);
    setHipaaEnabled(false);
    setCategories([...DEFAULT_CATEGORIES]);
    setNotifyEmails('');
    setWizardOpen(true);
  };

  const toggleRole = (key: string) => {
    setSelectedRoles((prev) =>
      prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]
    );
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const emails = notifyEmails.split(',').map((e) => e.trim()).filter(Boolean);
      const defaultName = appType === 'react'
        ? (pluginName.trim() || 'React App Plugin')
        : (pluginName.trim() || `Snap Plugin — ${selectedConnection?.name || ''}`);
      const pluginRef = await addDoc(collection(db, 'tenants', tenantId, 'snapPlugins'), {
        tenantId,
        appType,
        connectionId: appType === 'react' ? '' : selectedConnectionId,
        name: defaultName,
        status: 'active',
        selectedRoles: appType === 'react' ? [] : selectedRoles,
        hipaaEnabled: hipaaEnabled || false,
        retentionDays: hipaaEnabled ? 2555 : 365,
        snapSettings: {
          ...DEFAULT_SNAP_SETTINGS,
          allowRecording: hipaaEnabled ? false : allowRecording,
          categories,
          notifyEmails: emails,
        },
        customBranding: { ...DEFAULT_BRANDING },
        createdAt: serverTimestamp(),
      });
      navigate(`/snap-plugins/${pluginRef.id}`);
    } finally {
      setSaving(false);
      setWizardOpen(false);
    }
  };

  return (
    <div>
      <SEO title="Snap Plugins" path="/snap-plugins" />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Snap Plugins</h1>
          <p className="text-sm text-gray-500 mt-1">Configure and deploy visual feedback widgets for your Knack apps.</p>
        </div>
        <button onClick={openWizard} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm">
          <PlusIcon className="h-4 w-4" />
          New Plugin
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />)}
        </div>
      ) : plugins.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-12 text-center">
          <CameraIcon className="h-12 w-12 text-gray-300 mx-auto" />
          <h3 className="mt-3 text-sm font-medium text-gray-900">No snap plugins yet</h3>
          <p className="mt-1 text-sm text-gray-500">Create your first plugin to start capturing visual feedback.</p>
          {connections.length === 0 ? (
            <Link to="/connections" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
              Connect a Knack app first →
            </Link>
          ) : (
            <button onClick={openWizard} className="mt-4 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
              <PlusIcon className="h-4 w-4" />
              New Plugin
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="divide-y divide-gray-100">
            {plugins.map((plugin) => {
              const conn = connections.find((c) => c.id === plugin.connectionId);
              const isReact = plugin.appType === 'react';
              return (
                <Link key={plugin.id} to={`/snap-plugins/${plugin.id}`} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="bg-blue-50 rounded-lg p-2.5">
                    <CameraIcon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{plugin.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {isReact
                        ? 'React / Firebase App'
                        : `${conn?.name || 'Unknown connection'} · ${plugin.selectedRoles.length} role${plugin.selectedRoles.length !== 1 ? 's' : ''}`
                      }
                    </p>
                  </div>
                  {isReact && (
                    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">React</span>
                  )}
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    plugin.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {plugin.status}
                  </span>
                  <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Creation Wizard */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 pt-6">
              <StepIndicator current={step} total={appType === 'react' ? 3 : 4} />
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                {step === 1 && 'Choose App Type'}
                {step === 2 && (appType === 'react' ? 'Configure Snap Settings' : 'Select Roles')}
                {step === 3 && (appType === 'react' ? 'Review & Activate' : 'Configure Snap Settings')}
                {step === 4 && 'Review & Activate'}
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                {step === 1 && 'Choose how this widget will be embedded.'}
                {step === 2 && (appType === 'react' ? 'Configure how the snap widget behaves.' : 'Which user role tables should have access to the snap widget?')}
                {step === 3 && (appType === 'react' ? 'Review your settings before creating the plugin.' : 'Configure how the snap widget behaves.')}
                {step === 4 && 'Review your settings before creating the plugin.'}
              </p>
            </div>

            <div className="px-6 pb-6">
              {/* Step 1: Choose App Type + Connection */}
              {step === 1 && (
                <div className="space-y-4">
                  {/* App type toggle */}
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                    <button
                      onClick={() => { setAppType('knack'); setSelectedConnectionId(''); }}
                      className={`flex-1 py-3 text-sm font-medium transition-colors ${
                        appType === 'knack' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Knack App
                    </button>
                    <button
                      onClick={() => { setAppType('react'); setSelectedConnectionId(''); setSelectedRoles([]); }}
                      className={`flex-1 py-3 text-sm font-medium border-l border-gray-200 transition-colors ${
                        appType === 'react' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      React / Firebase App
                    </button>
                  </div>

                  {appType === 'react' ? (
                    <div className="bg-indigo-50 rounded-lg px-4 py-4 text-sm text-indigo-700 space-y-1">
                      <p className="font-medium">No Knack connection needed.</p>
                      <p className="text-indigo-600 text-xs">The widget will authenticate using Firebase Auth. All logged-in users will see the Snap button — no role filtering applies.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Select a Knack connection</p>
                      {connections.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-sm text-gray-500">No connections yet.</p>
                          <Link to="/connections" onClick={() => setWizardOpen(false)} className="text-sm text-blue-600 hover:underline mt-1 inline-block">
                            Add a connection first →
                          </Link>
                        </div>
                      ) : (
                        connections.map((conn) => (
                          <button
                            key={conn.id}
                            onClick={() => setSelectedConnectionId(conn.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-colors ${
                              selectedConnectionId === conn.id
                                ? 'border-blue-600 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="bg-blue-100 rounded-lg p-2">
                              <CameraIcon className="h-5 w-5 text-blue-600" />
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-medium text-gray-900">{conn.name}</p>
                              <p className="text-xs text-gray-400 font-mono">{conn.appId}</p>
                            </div>
                            {selectedConnectionId === conn.id && (
                              <CheckCircleIcon className="h-5 w-5 text-blue-600 ml-auto" />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Select Roles (Knack) or Settings (React) */}
              {step === 2 && appType === 'react' && (
                <div className="space-y-5">
                  <div className="bg-indigo-50 rounded-lg px-4 py-3 text-sm text-indigo-700">
                    <p className="font-medium">No role selection needed.</p>
                    <p className="text-indigo-600 text-xs mt-0.5">All authenticated Firebase users will see the Snap button.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Plugin Name</label>
                    <input
                      type="text"
                      value={pluginName}
                      onChange={(e) => setPluginName(e.target.value)}
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      placeholder="React App Plugin"
                    />
                  </div>
                  <div className="flex items-center justify-between py-3 border-t border-gray-100">
                    <div>
                      <p className="text-sm font-medium text-gray-900">HIPAA Compliant Mode</p>
                      <p className="text-xs text-gray-400">PHI scanning, 7-year retention, recording disabled</p>
                    </div>
                    <button
                      onClick={() => { const next = !hipaaEnabled; setHipaaEnabled(next); if (next) setAllowRecording(false); }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${ hipaaEnabled ? 'bg-green-600' : 'bg-gray-200' }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${ hipaaEnabled ? 'translate-x-6' : 'translate-x-1' }`} />
                    </button>
                  </div>
                  <div className={`flex items-center justify-between py-3 border-t border-gray-100 ${ hipaaEnabled ? 'opacity-40 pointer-events-none' : '' }`}>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Allow Screen Recording</p>
                      <p className="text-xs text-gray-400">Enables the video capture mode in the widget</p>
                    </div>
                    <button
                      onClick={() => setAllowRecording((v) => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${ allowRecording ? 'bg-blue-600' : 'bg-gray-200' }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${ allowRecording ? 'translate-x-6' : 'translate-x-1' }`} />
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notification Emails <span className="text-gray-400 font-normal">(comma-separated)</span>
                    </label>
                    <input
                      type="text"
                      value={notifyEmails}
                      onChange={(e) => setNotifyEmails(e.target.value)}
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      placeholder="team@company.com"
                    />
                  </div>
                </div>
              )}

              {step === 2 && appType === 'knack' && selectedConnection && (
                <div className="space-y-2">
                  {selectedConnection.roles.length === 0 ? (
                    <div className="bg-yellow-50 rounded-lg px-4 py-3 text-sm text-yellow-700">
                      No role tables discovered for this connection. Go to Connection Details and re-sync.
                    </div>
                  ) : (
                    selectedConnection.roles.map((role: KnackRole) => (
                      <button
                        key={role.key}
                        onClick={() => toggleRole(role.key)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-colors ${
                          selectedRoles.includes(role.key)
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          selectedRoles.includes(role.key) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                        }`}>
                          {selectedRoles.includes(role.key) && (
                            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-gray-900">{role.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{role.key}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Step 3: Settings (Knack) OR Review (React) */}
              {step === 3 && appType === 'react' && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">App Type</span>
                      <span className="font-medium text-indigo-700">React / Firebase App</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Plugin Name</span>
                      <span className="font-medium text-gray-900">{pluginName || 'React App Plugin'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Role Filtering</span>
                      <span className="font-medium text-gray-900">None — all logged-in users</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Screen Recording</span>
                      <span className="font-medium text-gray-900">{hipaaEnabled ? 'Disabled (HIPAA)' : allowRecording ? 'Enabled' : 'Disabled'}</span>
                    </div>
                    {hipaaEnabled && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">HIPAA Mode</span>
                        <span className="font-medium text-green-700">✓ Enabled — 7-year retention, DLP scanning</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">After creation you'll be taken to the plugin details page where you can copy the React embed code and configure branding.</p>
                </div>
              )}

              {step === 3 && appType === 'knack' && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Plugin Name</label>
                    <input
                      type="text"
                      value={pluginName}
                      onChange={(e) => setPluginName(e.target.value)}
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      placeholder={`Snap Plugin — ${selectedConnection?.name || ''}`}
                    />
                  </div>

                  <div className="flex items-center justify-between py-3 border-t border-gray-100">
                    <div>
                      <p className="text-sm font-medium text-gray-900">HIPAA Compliant Mode</p>
                      <p className="text-xs text-gray-400">PHI scanning, 7-year retention, recording disabled</p>
                    </div>
                    <button
                      onClick={() => {
                        const next = !hipaaEnabled;
                        setHipaaEnabled(next);
                        if (next) setAllowRecording(false);
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        hipaaEnabled ? 'bg-green-600' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        hipaaEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  <div className={`flex items-center justify-between py-3 border-t border-gray-100 ${
                    hipaaEnabled ? 'opacity-40 pointer-events-none' : ''
                  }`}>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Allow Screen Recording</p>
                      <p className="text-xs text-gray-400">Enables the video capture mode in the widget</p>
                    </div>
                    <button
                      onClick={() => setAllowRecording((v) => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        allowRecording ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        allowRecording ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Submission Categories</label>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((cat) => (
                        <span key={cat} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 rounded-full px-3 py-1 text-xs font-medium">
                          {cat}
                          <button onClick={() => setCategories((prev) => prev.filter((c) => c !== cat))} className="text-blue-400 hover:text-blue-600 ml-0.5">×</button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notification Emails
                      <span className="text-gray-400 font-normal"> (comma-separated)</span>
                    </label>
                    <input
                      type="text"
                      value={notifyEmails}
                      onChange={(e) => setNotifyEmails(e.target.value)}
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      placeholder="team@company.com, manager@company.com"
                    />
                  </div>
                </div>
              )}

              {/* Step 4: Review (Knack only) */}
              {step === 4 && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Plugin Name</span>
                      <span className="font-medium text-gray-900">{pluginName || `Snap Plugin — ${selectedConnection?.name}`}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Connection</span>
                      <span className="font-medium text-gray-900">{selectedConnection?.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Roles</span>
                      <span className="font-medium text-gray-900">
                        {selectedConnection?.roles
                          .filter((r: KnackRole) => selectedRoles.includes(r.key))
                          .map((r: KnackRole) => r.name)
                          .join(', ') || 'None selected'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Screen Recording</span>
                      <span className="font-medium text-gray-900">{hipaaEnabled ? 'Disabled (HIPAA)' : allowRecording ? 'Enabled' : 'Disabled'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Categories</span>
                      <span className="font-medium text-gray-900">{categories.join(', ')}</span>
                    </div>
                    {hipaaEnabled && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">HIPAA Mode</span>
                        <span className="font-medium text-green-700">✓ Enabled — 7-year retention, DLP scanning</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    After creation you'll be taken to the plugin details page where you can copy the embed code, configure branding, and invite clients.
                  </p>
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between mt-6">
                <button
                  onClick={() => step === 1 ? setWizardOpen(false) : setStep((s) => (s - 1) as WizardStep)}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  {step === 1 ? 'Cancel' : '← Back'}
                </button>
                {/* React: 3 steps total (1,2,3); Knack: 4 steps */}
                {((appType === 'react' && step < 3) || (appType === 'knack' && step < 4)) ? (
                  <button
                    onClick={() => setStep((s) => (s + 1) as WizardStep)}
                    disabled={
                      (step === 1 && appType === 'knack' && !selectedConnectionId) ||
                      (step === 2 && appType === 'knack' && selectedRoles.length === 0)
                    }
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-40"
                  >
                    Next →
                  </button>
                ) : (
                  <button
                    onClick={handleCreate}
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
                  >
                    {saving ? 'Creating…' : 'Create Plugin'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
