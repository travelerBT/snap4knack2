import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { QueueListIcon, ArrowDownTrayIcon, CameraIcon } from '@heroicons/react/24/outline';

const activeClass = 'border-blue-500 text-blue-700 border-b-2 inline-flex items-center gap-1.5 px-1 pt-1 text-sm font-medium';
const inactiveClass = 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 border-b-2 inline-flex items-center gap-1.5 px-1 pt-1 text-sm font-medium';

export default function ClientLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <nav className="bg-white shadow-sm z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <CameraIcon className="h-8 w-8 text-blue-600" />
                <span className="ml-2 text-lg font-bold text-gray-900">Snap4Knack</span>
                <span className="ml-2 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Client Portal</span>
              </div>
              <div className="hidden md:ml-8 md:flex md:space-x-6">
                <NavLink to="/client-portal" end className={({ isActive }) => isActive ? activeClass : inactiveClass}>
                  <QueueListIcon className="h-4 w-4" />
                  My Snaps
                </NavLink>
                <NavLink to="/client-portal/export" className={({ isActive }) => isActive ? activeClass : inactiveClass}>
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  Export
                </NavLink>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500 hidden md:block">{user?.email}</span>
              <button
                onClick={handleLogout}
                className="text-sm text-red-600 hover:text-red-800 font-medium"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl w-full mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <Outlet />
      </main>

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
