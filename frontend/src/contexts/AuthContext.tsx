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
  speculativeGroupId: string | undefined;
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
  speculativeGroupId: undefined,
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
  // localStorage の active group id をマウント時に一度だけ同期的に読む「推測値」。
  // applyGroups の確定 group とは別管理（groups 確定を待たずに参照できるようにするため）。
  const [speculativeGroupId, setSpeculativeGroupId] = useState<
    string | undefined
  >(() =>
    typeof window !== "undefined"
      ? (localStorage.getItem(ACTIVE_GROUP_KEY) ?? undefined)
      : undefined,
  );
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
    // speculativeGroupId は常に確定状態と同期させる（signOut/switchGroup と同様、
    // Decision 5）。ここでズレると、group が null になった後の effectiveGroupId
    // （group が null のとき speculativeGroupId にフォールバックする）が、もう
    // 存在しない/所属していないグループの id を指し続けてしまう。
    setSpeculativeGroupId(active?.groupId ?? undefined);
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
    let cancelled = false;
    getSupabaseClient().then((client) => {
      if (cancelled) return;
      if (!client) {
        setLoading(false);
        return;
      }
      client.auth.getSession().then(({ data: { session: s } }) => {
        if (cancelled) return;
        setSession(s);
        setUser(s?.user ?? null);
        if (s) {
          // loadGroups が applyGroups 後に loading を解除する。
          loadGroups(s.access_token);
        } else {
          setLoading(false);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [loadGroups]);

  useEffect(() => {
    let cancelled = false;
    let sub: { unsubscribe: () => void } | undefined;
    getSupabaseClient().then((client) => {
      if (cancelled || !client) return;
      sub = client.auth.onAuthStateChange((_event, s) => {
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
      }).data.subscription;
    });
    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, [loadGroups]);

  const signInWithGoogle = async (redirectTo?: string) => {
    const client = await getSupabaseClient();
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
    const client = await getSupabaseClient();
    if (!client) return;
    await client.auth.signOut();
    loadedTokenRef.current = null;
    setSession(null);
    setUser(null);
    setGroups([]);
    setGroup(null);
    setSpeculativeGroupId(undefined);
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
      setSpeculativeGroupId(groupId);
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
        speculativeGroupId,
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
