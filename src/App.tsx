import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import ClientLayout from './components/ClientLayout';

// Public pages
import Home from './pages/Home';
import Login from './pages/Login';
import LegalPage from './pages/LegalPage';
import AcceptInvite from './pages/AcceptInvite';

// Tenant / Admin pages
import Dashboard from './pages/Dashboard';
import Connections from './pages/Connections';
import ConnectionDetails from './pages/ConnectionDetails';
import SnapPlugins from './pages/SnapPlugins';
import SnapPluginDetails from './pages/SnapPluginDetails';
import SnapFeed from './pages/SnapFeed';
import SnapDetail from './pages/SnapDetail';
import Account from './pages/Account';
import ApiKeys from './pages/ApiKeys';
import Admin from './pages/Admin';
import AdminUsers from './pages/AdminUsers';

// Client portal pages
import ClientPortal from './pages/client/ClientPortal';
import ClientSnapDetail from './pages/client/ClientSnapDetail';
import ClientExport from './pages/client/ClientExport';

function RootRedirect() {
  const { loading, firebaseUser, isClient } = useAuth();
  if (loading) return null;
  if (!firebaseUser) return <Navigate to="/home" replace />;
  if (isClient) return <Navigate to="/client-portal" replace />;
  return <Navigate to="/dashboard" replace />;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loading, firebaseUser } = useAuth();
  if (loading) return null;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireClient({ children }: { children: React.ReactNode }) {
  const { loading, firebaseUser, isClient } = useAuth();
  if (loading) return null;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (!isClient) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Root redirect */}
      <Route path="/" element={<RootRedirect />} />

      {/* Public routes */}
      <Route path="/home" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/legal/:page" element={<LegalPage />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />

      {/* Client portal — ClientLayout */}
      <Route
        path="/client-portal"
        element={
          <RequireClient>
            <ClientLayout />
          </RequireClient>
        }
      >
        <Route index element={<ClientPortal />} />
        <Route path="export" element={<ClientExport />} />
        <Route path="snap/:id" element={<ClientSnapDetail />} />
      </Route>

      {/* Tenant / Admin — main Layout */}
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/connections" element={<Connections />} />
        <Route path="/connections/:id" element={<ConnectionDetails />} />
        <Route path="/snap-plugins" element={<SnapPlugins />} />
        <Route path="/snap-plugins/:id" element={<SnapPluginDetails />} />
        <Route path="/snap-feed" element={<SnapFeed />} />
        <Route path="/snap-feed/:id" element={<SnapDetail />} />
        <Route path="/account" element={<Account />} />
        <Route path="/api-keys" element={<ApiKeys />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/users" element={<AdminUsers />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HelmetProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </HelmetProvider>
  );
}
