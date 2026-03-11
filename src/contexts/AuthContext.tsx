import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { AuthContextType, User, Tenant, UserRole } from '../types';

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (!fbUser) {
        setUser(null);
        setTenant(null);
        setLoading(false);
        return;
      }
      try {
        const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          // Support legacy single role string → roles array
          if (!userData.roles && (userData as { role?: string }).role) {
            userData.roles = [(userData as { role?: string }).role as UserRole];
          }
          setUser(userData);

          // Fetch tenant if user is tenant/admin
          if (userData.tenantId) {
            const tenantDoc = await getDoc(doc(db, 'tenants', userData.tenantId));
            if (tenantDoc.exists()) {
              setTenant(tenantDoc.data() as Tenant);
            }
          }
        } else {
          // New user — create minimal user doc
          const newUser: User = {
            id: fbUser.uid,
            uid: fbUser.uid,
            email: fbUser.email || '',
            displayName: fbUser.displayName || '',
            role: 'tenant',
            roles: ['tenant'],
            createdAt: serverTimestamp() as User['createdAt'],
          };
          await setDoc(doc(db, 'users', fbUser.uid), newUser);
          setUser(newUser);
        }
      } catch (err) {
        console.error('Error loading user data:', err);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const signup = async (email: string, password: string, companyName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;

    // Create tenant doc (tenantId === uid)
    await setDoc(doc(db, 'tenants', uid), {
      ownerId: uid,
      companyName,
      email,
      createdAt: serverTimestamp(),
    });

    // Create user doc
    await setDoc(doc(db, 'users', uid), {
      id: uid,
      uid,
      email,
      displayName: companyName,
      role: 'tenant',
      roles: ['tenant'],
      tenantId: uid,
      createdAt: serverTimestamp(),
    });
  };

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
    // Update lastLogin
    if (auth.currentUser) {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        lastLogin: serverTimestamp(),
      });
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const acceptTerms = async () => {
    if (!firebaseUser) return;
    await updateDoc(doc(db, 'users', firebaseUser.uid), {
      tosAcceptedAt: serverTimestamp(),
    });
    if (user) {
      setUser({ ...user, tosAcceptedAt: serverTimestamp() as User['tosAcceptedAt'] });
    }
  };

  const userRoles: UserRole[] = user?.roles || [];
  const isAdmin = userRoles.includes('admin');
  const isTenant = userRoles.includes('tenant') || isAdmin;
  const isClient = userRoles.includes('client');
  const clientAccess = user?.clientAccess || [];
  const sharedPluginAccess = user?.sharedPluginAccess || [];
  const tosAccepted = !!user?.tosAcceptedAt;

  const value: AuthContextType = {
    firebaseUser,
    user,
    tenant,
    userRoles,
    isAdmin,
    isTenant,
    isClient,
    clientAccess,
    sharedPluginAccess,
    loading,
    tosAccepted,
    signup,
    login,
    logout,
    resetPassword,
    acceptTerms,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
