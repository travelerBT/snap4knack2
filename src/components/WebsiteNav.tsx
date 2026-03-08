import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { CameraIcon, Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';

export default function WebsiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  return (
    <nav className={`sticky top-0 z-50 transition-shadow bg-white ${scrolled ? 'shadow-md' : 'shadow-sm'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-8">
            <NavLink to="/home" className="flex items-center gap-2">
              <CameraIcon className="h-8 w-8 text-blue-600" />
              <span className="text-lg font-bold text-gray-900">Snap4Knack</span>
            </NavLink>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <NavLink to="/faq" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              FAQ
            </NavLink>
            <NavLink to="/login" className="text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-600 rounded-lg px-4 py-2 hover:bg-blue-50 transition-colors">
              Sign in
            </NavLink>
          </div>
          <div className="flex items-center md:hidden">
            <button onClick={() => setMobileOpen((v) => !v)} className="p-2 text-gray-400 hover:text-gray-600">
              {mobileOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-200 px-4 py-4">
          <NavLink to="/faq" className="block text-sm font-medium text-gray-600 py-2">FAQ</NavLink>
          <NavLink to="/login" className="block text-sm font-medium text-blue-600 py-2">Sign in</NavLink>
        </div>
      )}
    </nav>
  );
}
