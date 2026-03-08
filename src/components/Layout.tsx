import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import TermsAgreementBanner from './TermsAgreementBanner';
import {
  Squares2X2Icon,
  LinkIcon,
  CameraIcon,
  QueueListIcon,
  UserCircleIcon,
  ShieldCheckIcon,
  Bars3Icon,
  XMarkIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', Icon: Squares2X2Icon },
  { to: '/connections', label: 'Connections', Icon: LinkIcon },
  { to: '/snap-plugins', label: 'Snap Plugins', Icon: CameraIcon },
  { to: '/snap-feed', label: 'Snap Feed', Icon: QueueListIcon },
];

const activeClass =
  'border-blue-500 text-gray-900 border-b-2 inline-flex items-center gap-1.5 px-1 pt-1 text-sm font-medium';
const inactiveClass =
  'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 border-b-2 inline-flex items-center gap-1.5 px-1 pt-1 text-sm font-medium';

const mobileActiveClass =
  'bg-blue-50 border-l-4 border-blue-500 text-blue-700 flex items-center gap-2 pl-3 pr-4 py-2 text-base font-medium';
const mobileInactiveClass =
  'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 flex items-center gap-2 pl-3 pr-4 py-2 text-base font-medium border-l-4';

export default function Layout() {
  const { user, tenant, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <TermsAgreementBanner />

      {/* Top nav */}
      <nav className="bg-white shadow-sm z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Left: logo + nav links */}
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <CameraIcon className="h-8 w-8 text-blue-600" />
                <span className="ml-2 text-lg font-bold text-gray-900">Snap4Knack</span>
              </div>
              <div className="hidden md:ml-8 md:flex md:space-x-6">
                {navItems.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) => (isActive ? activeClass : inactiveClass)}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </NavLink>
                ))}
                {isAdmin && (
                  <NavLink
                    to="/admin"
                    className={({ isActive }) => (isActive ? activeClass : inactiveClass)}
                  >
                    <ShieldCheckIcon className="h-4 w-4" />
                    Admin
                  </NavLink>
                )}
              </div>
            </div>

            {/* Right: user menu */}
            <div className="hidden md:flex md:items-center gap-4">
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
                >
                  <UserCircleIcon className="h-7 w-7 text-gray-400" />
                  <span className="font-medium">{tenant?.companyName || user?.displayName || user?.email}</span>
                  <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg ring-1 ring-black ring-opacity-5 z-50">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-xs text-gray-500">Signed in as</p>
                      <p className="text-sm font-medium text-gray-900 truncate">{user?.email}</p>
                    </div>
                    <div className="py-1">
                      <button
                        onClick={() => { navigate('/account'); setUserMenuOpen(false); }}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <UserCircleIcon className="h-4 w-4" />
                        Account
                      </button>
                      <div className="border-t border-gray-100 mt-1 pt-1">
                        <button
                          onClick={handleLogout}
                          className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                        >
                          Sign out
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile hamburger */}
            <div className="flex items-center md:hidden">
              <button
                onClick={() => setMobileOpen((v) => !v)}
                className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
              >
                {mobileOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-200">
            <div className="pt-2 pb-3 space-y-1">
              {navItems.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => (isActive ? mobileActiveClass : mobileInactiveClass)}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </NavLink>
              ))}
              {isAdmin && (
                <NavLink
                  to="/admin"
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => (isActive ? mobileActiveClass : mobileInactiveClass)}
                >
                  <ShieldCheckIcon className="h-5 w-5" />
                  Admin
                </NavLink>
              )}
            </div>
            <div className="border-t border-gray-200 py-3 px-4">
              <p className="text-sm font-medium text-gray-900">{tenant?.companyName || user?.displayName}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
              <div className="mt-3 space-y-1">
                <NavLink to="/account" onClick={() => setMobileOpen(false)} className="block text-sm text-gray-700 py-1">Account</NavLink>
                <button onClick={handleLogout} className="block text-sm text-red-600 py-1">Sign out</button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Page content */}
      <main className="flex-1 max-w-7xl w-full mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between text-xs text-gray-400">
          <span>© {new Date().getFullYear()} Fine Mountain Consulting LLC</span>
          <div className="flex gap-4">
            <a href="/legal/privacy-policy" className="hover:text-gray-600">Privacy</a>
            <a href="/legal/terms-of-service" className="hover:text-gray-600">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
