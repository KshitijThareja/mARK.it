// utils/auth-context.tsx
"use client"
import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from "@/app/utils/supabase/client";
import { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  refreshUser: () => Promise<void>;
  syncWithExtension: (user: User) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  refreshUser: async () => {},
  syncWithExtension: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session_token, setSessionToken] = useState<string | null>(null);
  const supabase = createClient();

  const syncWithExtension = async (user: User) => {
    try {
      // Check if we're in a browser environment
      if (typeof window === 'undefined') return;

      // Get the extension ID from environment or config
      const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID;
      if (!extensionId) {
        console.warn('Extension ID not configured');
        return;
      }

      // Send message to extension
      const response = await chrome.runtime.sendMessage(extensionId, { 
        uuid: user.id,
        session_token: session_token,
        email: user.email,
        timestamp: Date.now()
      });

      console.log('Extension sync response:', response);
      
      // Store sync status
      localStorage.setItem('extensionSynced', 'true');
    } catch (error) {
      console.error('Failed to sync with extension:', error);
      // Store failed sync status
      localStorage.setItem('extensionSynced', 'false');
    }
  };

  const refreshUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    if (user) {
      await syncWithExtension(user);
    }
  };

  useEffect(() => {
    refreshUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (_event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem('userUUID');
        localStorage.removeItem('extensionSynced');
      } else if (session?.user) {
        console.log("Session", session);
        setUser(session.user);
        localStorage.setItem('userUUID', session.user.id);
        setSessionToken(session.access_token);
        console.log("Session Token", session.access_token);
        await syncWithExtension(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, refreshUser, syncWithExtension }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);