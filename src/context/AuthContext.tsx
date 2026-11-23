import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getStoredToken, setStoredToken } from '../lib/api.ts';
import { signInWithGooglePopup } from '../lib/firebase.ts';
import type { AuthUser, NotificationItem, UserRole } from '../types.ts';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  notifications: NotificationItem[];
  unreadCount: number;
  login: (identifier: string, password: string) => Promise<AuthUser>;
  register: (payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role?: 'customer';
    city?: string;
  }) => Promise<AuthUser>;
  demoLogin: (role: UserRole) => Promise<AuthUser>;
  loginWithGoogle: () => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (id: number) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const refreshNotifications = useCallback(async () => {
    if (!getStoredToken()) {
      setNotifications([]);
      return;
    }
    try {
      const data = await api.get<{ notifications: NotificationItem[] }>('/api/notifications');
      setNotifications(data.notifications || []);
    } catch {
      // ignore transient errors
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api.get<{ user: AuthUser }>('/api/auth/me');
      setUser(data.user);
      await refreshNotifications();
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [refreshNotifications]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (identifier: string, password: string) => {
    const data = await api.post<{ token: string; user: AuthUser }>('/api/auth/login', {
      identifier,
      password,
    });
    setStoredToken(data.token);
    setUser(data.user);
    await refreshNotifications();
    return data.user;
  };

  const register = async (payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role?: 'customer';
    city?: string;
  }) => {
    const data = await api.post<{ token: string; user: AuthUser }>('/api/auth/register', {
      ...payload,
      role: 'customer',
    });
    setStoredToken(data.token);
    setUser(data.user);
    await refreshNotifications();
    return data.user;
  };

  const demoLogin = async (role: UserRole) => {
    const data = await api.post<{ token: string; user: AuthUser }>('/api/auth/demo-login', { role });
    setStoredToken(data.token);
    setUser(data.user);
    await refreshNotifications();
    return data.user;
  };

  const loginWithGoogle = async () => {
    const idToken = await signInWithGooglePopup();
    const data = await api.post<{ token: string; user: AuthUser }>('/api/auth/firebase', { idToken });
    setStoredToken(data.token);
    setUser(data.user);
    await refreshNotifications();
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // ignore
    }
    setStoredToken(null);
    setUser(null);
    setNotifications([]);
  };

  const markNotificationRead = async (id: number) => {
    await api.patch(`/api/notifications/${id}/read`);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
  };

  const markAllNotificationsRead = async () => {
    await api.post('/api/notifications/read-all');
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        notifications,
        unreadCount,
        login,
        register,
        demoLogin,
        loginWithGoogle,
        logout,
        refreshUser,
        refreshNotifications,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
