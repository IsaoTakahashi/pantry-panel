"use client";

import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { fetchMyGroup } from "@/lib/authApi";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { GroupInfo } from "@/types/group";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  group: GroupInfo | null;
  loading: boolean;
  signInWithGoogle: (redirectTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshGroup: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  group: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  refreshGroup: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const loadGroup = useCallback(async (accessToken: string) => {
    const g = await fetchMyGroup(accessToken);
    setGroup(g);
  }, []);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      setLoading(false);
      return;
    }

    client.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s) {
        loadGroup(s.access_token).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
  }, [loadGroup]);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s) {
        loadGroup(s.access_token);
      } else {
        setGroup(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadGroup]);

  const signInWithGoogle = async (redirectTo?: string) => {
    const client = getSupabaseClient();
    if (!client) return;
    await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          redirectTo ??
          (typeof window !== "undefined"
            ? `${window.location.origin}/stock-items`
            : undefined),
      },
    });
  };

  const signOut = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    await client.auth.signOut();
    setSession(null);
    setUser(null);
    setGroup(null);
  };

  const refreshGroup = useCallback(async () => {
    if (!session) return;
    await loadGroup(session.access_token);
  }, [session, loadGroup]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        group,
        loading,
        signInWithGoogle,
        signOut,
        refreshGroup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
