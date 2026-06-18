"use client";

import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
  // 直近に groups を取得したアクセストークン。起動時に getSession と
  // onAuthStateChange(INITIAL_SESSION/SIGNED_IN/TOKEN_REFRESHED) が同じ
  // トークンで重複発火しても /api/groups/me を 1 回に抑えるためのガード。
  const loadedTokenRef = useRef<string | null>(null);

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
    async (accessToken: string, options?: { force?: boolean }) => {
      // ガードは await の前に同期的に立てる。getSession と
      // onAuthStateChange がほぼ同時に発火しても二重 fetch しないため。
      if (!options?.force && loadedTokenRef.current === accessToken) return;
      loadedTokenRef.current = accessToken;
      const gs = await fetchMyGroups(accessToken).catch(() => []);
      applyGroups(gs);
      // groups が確定してから loading を解除する。dedup の早期 return より後に
      // あるため、同一トークンの重複呼び出しは loading を倒さない（実 fetch のみ）。
      setLoading(false);
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
        // loadGroups が applyGroups 後に loading を解除する。
        loadGroups(s.access_token);
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
      if (s) {
        setSession(s);
        setUser(s.user ?? null);
        // セッションありの場合は loadGroups が applyGroups 後に loading を解除する。
        // ここで無条件に setLoading(false) すると group=null のまま loading が
        // 倒れ、AuthGuard が起動時の group 取得待ち中に誤って /no-group へ飛ばす。
        loadGroups(s.access_token);
      } else {
        setSession(null);
        setUser(null);
        loadedTokenRef.current = null;
        setGroups([]);
        setGroup(null);
        setLoading(false);
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
    loadedTokenRef.current = null;
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
    // 同じトークンでもグループの作成/改名後は強制再取得する。
    await loadGroups(session.access_token, { force: true });
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
