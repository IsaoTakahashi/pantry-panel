"use client";

import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { fetchMyGroups } from "@/lib/authApi";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { GroupInfo } from "@/types/group";

const ACTIVE_GROUP_KEY = "pantry-panel:active-group-id";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  groups: GroupInfo[];
  group: GroupInfo | null;
  loading: boolean;
  signInWithGoogle: (redirectTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshGroup: () => Promise<void>;
  switchGroup: (groupId: string) => void;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  groups: [],
  group: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  refreshGroup: async () => {},
  switchGroup: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const applyGroups = useCallback((gs: GroupInfo[]) => {
    setGroups(gs);
    const savedId =
      typeof window !== "undefined"
        ? localStorage.getItem(ACTIVE_GROUP_KEY)
        : null;
    const active = gs.find((g) => g.groupId === savedId) ?? gs[0] ?? null;
    setGroup(active);
    if (active && typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_GROUP_KEY, active.groupId);
    }
  }, []);

  const loadGroups = useCallback(
    async (accessToken: string) => {
      const gs = await fetchMyGroups(accessToken).catch(() => []);
      applyGroups(gs);
    },
    [applyGroups],
  );

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
        loadGroups(s.access_token).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
  }, [loadGroups]);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s) {
        loadGroups(s.access_token);
      } else {
        setGroups([]);
        setGroup(null);
      }
    });
    return () => subscription.unsubscribe();
  }, [loadGroups]);

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
    setGroups([]);
    setGroup(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(ACTIVE_GROUP_KEY);
    }
  };

  const refreshGroup = useCallback(async () => {
    if (!session) return;
    await loadGroups(session.access_token);
  }, [session, loadGroups]);

  const switchGroup = useCallback(
    (groupId: string) => {
      const target = groups.find((g) => g.groupId === groupId);
      if (!target) return;
      setGroup(target);
      if (typeof window !== "undefined") {
        localStorage.setItem(ACTIVE_GROUP_KEY, groupId);
      }
    },
    [groups],
  );

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        groups,
        group,
        loading,
        signInWithGoogle,
        signOut,
        refreshGroup,
        switchGroup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
