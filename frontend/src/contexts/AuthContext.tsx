"use client";

import type { Session, User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  clearActiveGroupCookie,
  getActiveGroupCookie,
  setActiveGroupCookie,
} from "@/lib/activeGroupCookie";
import { fetchMyGroups } from "@/lib/authApi";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { GroupInfo } from "@/types/group";

const ACTIVE_GROUP_KEY = "pantry-panel:active-group-id";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  groups: GroupInfo[];
  group: GroupInfo | null;
  initialGroupId: string | undefined;
  initialAuthenticated: boolean;
  loading: boolean;
  signInWithGoogle: (next?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshGroup: () => Promise<void>;
  switchGroup: (groupId: string) => void;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  groups: [],
  group: null,
  initialGroupId: undefined,
  initialAuthenticated: false,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  refreshGroup: async () => {},
  switchGroup: () => {},
});

export function AuthProvider({
  children,
  initialAuthenticated = false,
  initialGroupId: initialGroupIdProp,
}: {
  children: React.ReactNode;
  initialAuthenticated?: boolean;
  initialGroupId?: string;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [group, setGroup] = useState<GroupInfo | null>(null);
  // 初期グループIDの決定順序: (1) SSRがcookieから読んで渡した initialGroupIdProp
  // （最も正確、サーバー検証済み）(2) localStorage の同期読み取り（cookie未設定の
  // 移行期間や auth無効環境向けのフォールバック）。どちらも無ければ undefined の
  // まま、groups確定を待つ。
  const [initialGroupId, setInitialGroupId] = useState<string | undefined>(
    () =>
      initialGroupIdProp ??
      (typeof window !== "undefined"
        ? (localStorage.getItem(ACTIVE_GROUP_KEY) ?? undefined)
        : undefined),
  );
  const [loading, setLoading] = useState(true);

  // Migration（D1）: cookie未設定・localStorageに既存値があるユーザーの
  // 初回訪問時、一度だけ cookie に書き写す。以降の訪問では SSR が cookie を
  // 読めるようになる。effect は空の依存配列でマウント時に一度だけ実行する。
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (getActiveGroupCookie() !== undefined) return;
    const legacy = localStorage.getItem(ACTIVE_GROUP_KEY);
    if (legacy) setActiveGroupCookie(legacy);
  }, []);

  // 直近に groups を取得したアクセストークン。起動時に getSession と
  // onAuthStateChange(INITIAL_SESSION/SIGNED_IN/TOKEN_REFRESHED) が同じ
  // トークンで重複発火しても /api/groups/me を 1 回に抑えるためのガード。
  const loadedTokenRef = useRef<string | null>(null);
  const router = useRouter();

  const applyGroups = useCallback((gs: GroupInfo[]) => {
    setGroups(gs);
    // cookie を localStorage より優先する（D1: 読み取りの正はcookieに一本化する）。
    // cookie は SSRが読んだ値と同じ発生源であり、複数タブ・複数デバイスでの
    // 書き込み順序次第で localStorage と食い違いうる localStorage単独読みより
    // 信頼できる。cookie未設定（移行期間・auth無効環境）の場合のみ
    // localStorage にフォールバックする。
    const savedId =
      typeof window !== "undefined"
        ? (getActiveGroupCookie() ?? localStorage.getItem(ACTIVE_GROUP_KEY))
        : null;
    const active = gs.find((g) => g.groupId === savedId) ?? gs[0] ?? null;
    setGroup(active);
    // initialGroupId は常に確定状態と同期させる（signOut/switchGroup と同様、
    // Decision 5）。ここでズレると、group が null になった後の effectiveGroupId
    // （group が null のとき initialGroupId にフォールバックする）が、もう
    // 存在しない/所属していないグループの id を指し続けてしまう。
    setInitialGroupId(active?.groupId ?? undefined);
    if (active && typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_GROUP_KEY, active.groupId);
      setActiveGroupCookie(active.groupId);
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

  const signInWithGoogle = async (next?: string) => {
    const client = await getSupabaseClient();
    if (!client) return;
    const destination = next ?? "/stock-items";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(destination)}`,
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
    setInitialGroupId(undefined);
    if (typeof window !== "undefined") {
      localStorage.removeItem(ACTIVE_GROUP_KEY);
      clearActiveGroupCookie();
    }
    // signOut() はユーザーの明示的な操作であり、middleware が拾える「保護ルートへの
    // ナビゲーション」を伴わないため、ここで明示的に /login へ遷移させる
    // （middleware は未ログイン状態でのナビゲーション発生時のみ /login へ飛ばす。
    // signOut 自体はナビゲーションを起こさないため、放置すると保護ルート上に
    // session=null のまま留まり、AuthGuard が children を描画しない空白画面になる）。
    // push ではなく replace: sign-out は明示的・終端的な操作であり、履歴に
    // 保護ルートを残すと Back 押下で Router Cache から即座に復元され
    // （新規リクエストが発生せず middleware が走らない）、この修正が防ごうと
    // している「session=null のまま保護ルートに留まる」状態を Back 一回で
    // 再現してしまうため。
    router.replace("/login");
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
      setInitialGroupId(groupId);
      if (typeof window !== "undefined") {
        localStorage.setItem(ACTIVE_GROUP_KEY, groupId);
        setActiveGroupCookie(groupId);
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
        initialGroupId,
        initialAuthenticated,
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
