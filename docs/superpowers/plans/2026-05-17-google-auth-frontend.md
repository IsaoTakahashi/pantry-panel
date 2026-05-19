# Google 認証 — Plan B: Frontend Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note for this project:** Per `.claude/rules/general.md`, **the user writes test/production code; Claude proposes and reviews**. This is Plan B (Frontend Auth) of a 3-part series. Plan A (Backend Auth) must be deployed and working before Plan B's integration testing can be done end-to-end.

**Goal:** Supabase Auth (Google OAuth) の認証フロー・AuthContext・AuthGuard・招待ページを実装し、既存の API 呼び出しに JWT を付加する。

**Architecture:** `AuthContext` が Supabase セッションとバックエンドのグループ情報を保持。`AuthGuard` が未認証/グループ未所属をリダイレクト。API 呼び出しには `session.access_token` を `Authorization` ヘッダーとして付加。Supabase Realtime はクライアントが自動でセッション JWT を使うため変更不要。

**Tech Stack:** Next.js (TypeScript) / @supabase/supabase-js v2 / React / Vitest + React Testing Library / Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-05-17-google-auth-design.md`

**Issue:** #79

---

## File Structure

### Frontend (new)
- `frontend/src/types/group.ts` — グループ・招待の型定義
- `frontend/src/lib/authApi.ts` — グループ/招待の API 関数
- `frontend/src/lib/authApi.test.ts` — authApi ユニットテスト
- `frontend/src/contexts/AuthContext.tsx` — Supabase セッション + グループ情報の管理
- `frontend/src/contexts/AuthContext.test.tsx` — AuthContext テスト
- `frontend/src/components/AuthGuard.tsx` — 未認証/未所属のリダイレクト
- `frontend/src/components/AuthGuard.test.tsx` — AuthGuard テスト
- `frontend/src/app/login/page.tsx` — Google サインインページ
- `frontend/src/app/no-group/page.tsx` — グループ未所属ユーザー向け案内
- `frontend/src/app/join/page.tsx` — 招待トークン処理ページ
- `frontend/src/app/invite/page.tsx` — 招待リンク生成ページ（オーナー用）

### Frontend (modify)
- `frontend/src/lib/api.ts` — 全関数に `accessToken?: string` を追加
- `frontend/src/lib/api.test.ts` — Authorization ヘッダーのテスト追加
- `frontend/src/app/layout.tsx` — `<AuthProvider>` でラップ
- `frontend/src/app/stock-items/page.tsx` — `<AuthGuard>` + `useAuth()` でトークン取得 + ヘッダーにサインアウト・グループ名追加
- `frontend/.env.local.example` — `NEXT_PUBLIC_SUPABASE_*` の記載確認（既存）

---

## Task 1: グループ型定義の追加

**Files:**
- Create: `frontend/src/types/group.ts`

- [ ] **Step 1: 型ファイルを作成する**

`frontend/src/types/group.ts`:

```typescript
type GroupInfo = {
  groupId: string;
  name: string;
  role: "owner" | "member";
};

type GroupResponse = GroupInfo;

type GroupCreateResponse = {
  id: string;
  name: string;
  createdAt: string;
};

type InvitationResponse = {
  token: string;
  groupId: string;
  createdBy: string;
  expiresAt: string;
  useCount: number;
  createdAt: string;
};

export type {
  GroupCreateResponse,
  GroupInfo,
  GroupResponse,
  InvitationResponse,
};
```

- [ ] **Step 2: コミット**

```bash
git add frontend/src/types/group.ts
git commit -m "Add group and invitation type definitions"
```

---

## Task 2: authApi.ts の作成

**Files:**
- Create: `frontend/src/lib/authApi.ts`
- Create: `frontend/src/lib/authApi.test.ts`

- [ ] **Step 1: テストを作成する（失敗させる）**

`frontend/src/lib/authApi.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptInvitation,
  createGroup,
  createInvitation,
  fetchMyGroup,
} from "./authApi";

afterEach(() => {
  vi.restoreAllMocks();
});

const token = "test-access-token";

describe("fetchMyGroup", () => {
  it("200 のとき GroupInfo を返す", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ groupId: "g1", name: "我が家", role: "owner" }),
        { status: 200 },
      ),
    );
    const result = await fetchMyGroup(token);
    expect(result).toEqual({ groupId: "g1", name: "我が家", role: "owner" });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/groups/me"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
      }),
    );
  });

  it("403 のとき null を返す（グループ未所属）", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 403 }),
    );
    const result = await fetchMyGroup(token);
    expect(result).toBeNull();
  });

  it("401 のとき throw する", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 401 }),
    );
    await expect(fetchMyGroup(token)).rejects.toThrow("HTTP 401");
  });
});

describe("createGroup", () => {
  it("201 のとき Group を返す", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ id: "g1", name: "我が家", createdAt: "2026-01-01" }),
        { status: 201 },
      ),
    );
    const result = await createGroup("我が家", token);
    expect(result.name).toBe("我が家");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/groups"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("409 のとき throw する（既にグループ所属）", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 409 }),
    );
    await expect(createGroup("家", token)).rejects.toThrow("HTTP 409");
  });
});

describe("createInvitation", () => {
  it("201 のとき InvitationResponse を返す", async () => {
    const inv = {
      token: "tok-1",
      groupId: "g1",
      createdBy: "u1",
      expiresAt: "2026-05-24T00:00:00Z",
      useCount: 0,
      createdAt: "2026-05-17T00:00:00Z",
    };
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(inv), { status: 201 }),
    );
    const result = await createInvitation(token);
    expect(result.token).toBe("tok-1");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/invitations"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("acceptInvitation", () => {
  it("200 のとき GroupInfo を返す", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ groupId: "g1", name: "我が家", role: "member" }),
        { status: 200 },
      ),
    );
    const result = await acceptInvitation("inv-token", token);
    expect(result.role).toBe("member");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/invitations/inv-token/accept"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("404 のとき throw する（招待が見つからない）", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 404 }),
    );
    await expect(acceptInvitation("bad-token", token)).rejects.toThrow(
      "HTTP 404",
    );
  });

  it("410 のとき throw する（招待期限切れ）", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 410 }),
    );
    await expect(acceptInvitation("expired-token", token)).rejects.toThrow(
      "HTTP 410",
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
cd frontend
npx vitest run src/lib/authApi.test.ts
```

Expected: FAIL（モジュール未存在）

- [ ] **Step 3: authApi.ts を実装する**

`frontend/src/lib/authApi.ts`:

```typescript
import type {
  GroupCreateResponse,
  GroupInfo,
  InvitationResponse,
} from "@/types/group";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function fetchMyGroup(accessToken: string): Promise<GroupInfo | null> {
  const response = await fetch(`${API_BASE_URL}/api/groups/me`, {
    headers: authHeaders(accessToken),
  });
  if (response.status === 403 || response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function createGroup(
  name: string,
  accessToken: string,
): Promise<GroupCreateResponse> {
  const response = await fetch(`${API_BASE_URL}/api/groups`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function createInvitation(
  accessToken: string,
): Promise<InvitationResponse> {
  const response = await fetch(`${API_BASE_URL}/api/invitations`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function acceptInvitation(
  inviteToken: string,
  accessToken: string,
): Promise<GroupInfo> {
  const response = await fetch(
    `${API_BASE_URL}/api/invitations/${inviteToken}/accept`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
    },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export { acceptInvitation, createGroup, createInvitation, fetchMyGroup };
```

- [ ] **Step 4: テストを実行して全て通ることを確認する**

```bash
npx vitest run src/lib/authApi.test.ts
```

Expected: PASS（全テスト）

- [ ] **Step 5: コミット**

```bash
git add frontend/src/lib/authApi.ts frontend/src/lib/authApi.test.ts
git commit -m "Add authApi for group and invitation endpoints"
```

---

## Task 3: api.ts に accessToken を追加する

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/api.test.ts`

- [ ] **Step 1: api.ts の全関数に `accessToken?: string` を追加する**

`frontend/src/lib/api.ts` の先頭に helper 関数を追加し、各関数を修正する:

```typescript
function bearerHeaders(accessToken?: string): HeadersInit {
  if (!accessToken) return {};
  return { Authorization: `Bearer ${accessToken}` };
}
```

各関数のシグネチャと fetch 呼び出しを変更:

```typescript
async function fetchStockItems(accessToken?: string): Promise<StockItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/stock-items`, {
    headers: bearerHeaders(accessToken),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function createStockItem(
  req: CreateStockItemRequest,
  accessToken?: string,
): Promise<StockItem> {
  const response = await fetch(`${API_BASE_URL}/api/stock-items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...bearerHeaders(accessToken),
    },
    body: JSON.stringify(req),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function updateStockItem(
  id: string,
  req: UpdateStockItemRequest,
  accessToken?: string,
): Promise<StockItem> {
  const response = await fetch(`${API_BASE_URL}/api/stock-items/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...bearerHeaders(accessToken),
    },
    body: JSON.stringify(req),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function deleteStockItem(
  id: string,
  accessToken?: string,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/stock-items/${id}`, {
    method: "DELETE",
    headers: bearerHeaders(accessToken),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

async function searchImages(
  query: string,
  num = 10,
  accessToken?: string,
): Promise<ImageSearchResult[]> {
  const params = new URLSearchParams({ q: query, num: String(num) });
  const response = await fetch(`${API_BASE_URL}/api/image-search?${params}`, {
    headers: bearerHeaders(accessToken),
  });
  // ... 既存のエラーハンドリングはそのまま
}
```

- [ ] **Step 2: api.test.ts に Authorization ヘッダーのテストを追加する**

`frontend/src/lib/api.test.ts` の `fetchStockItems` の describe 内に追加:

```typescript
it("accessToken を渡すと Authorization ヘッダーが付加される", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify([]), { status: 200 }),
  );
  await fetchStockItems("my-token");
  expect(global.fetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      headers: { Authorization: "Bearer my-token" },
    }),
  );
});

it("accessToken なしのとき Authorization ヘッダーなし（後方互換）", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify([]), { status: 200 }),
  );
  await fetchStockItems();
  expect(global.fetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ headers: {} }),
  );
});
```

- [ ] **Step 3: テストを実行して全て通ることを確認する**

```bash
npx vitest run src/lib/api.test.ts
```

Expected: PASS（全テスト）

- [ ] **Step 4: コミット**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/api.test.ts
git commit -m "Add optional accessToken parameter to all API functions"
```

---

## Task 4: AuthContext の作成

**Files:**
- Create: `frontend/src/contexts/AuthContext.tsx`
- Create: `frontend/src/contexts/AuthContext.test.tsx`

- [ ] **Step 1: テストを作成する（失敗させる）**

`frontend/src/contexts/AuthContext.test.tsx`:

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth, AuthProvider } from "./AuthContext";

// Supabase client のモック
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockSignOut = vi.fn();
const mockClient = {
  auth: {
    getSession: mockGetSession,
    onAuthStateChange: mockOnAuthStateChange,
    signInWithOAuth: mockSignInWithOAuth,
    signOut: mockSignOut,
  },
};

vi.mock("@/lib/supabaseClient", () => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/authApi", () => ({
  fetchMyGroup: vi.fn(),
}));

import { getSupabaseClient } from "@/lib/supabaseClient";
import { fetchMyGroup } from "@/lib/authApi";

function TestConsumer() {
  const { session, group, loading } = useAuth();
  if (loading) return <span>loading</span>;
  return (
    <span>
      {session ? "authenticated" : "anonymous"}
      {group ? `:${group.name}` : ":no-group"}
    </span>
  );
}

function renderWithAuth() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.mocked(getSupabaseClient).mockReturnValue(mockClient as never);
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("AuthContext", () => {
  it("Supabase 未設定のとき loading=false・session=null で即時完了する", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    renderWithAuth();
    await waitFor(() =>
      expect(screen.getByText("anonymous:no-group")).toBeInTheDocument(),
    );
  });

  it("セッションがないとき anonymous を表示する", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    renderWithAuth();
    await waitFor(() =>
      expect(screen.getByText("anonymous:no-group")).toBeInTheDocument(),
    );
  });

  it("セッションがあるときグループ情報を取得して表示する", async () => {
    const session = { access_token: "tok", user: { id: "u1" } };
    mockGetSession.mockResolvedValue({ data: { session } });
    vi.mocked(fetchMyGroup).mockResolvedValue({
      groupId: "g1",
      name: "我が家",
      role: "owner",
    });
    renderWithAuth();
    await waitFor(() =>
      expect(screen.getByText("authenticated:我が家")).toBeInTheDocument(),
    );
    expect(fetchMyGroup).toHaveBeenCalledWith("tok");
  });

  it("グループ未所属のとき no-group を表示する", async () => {
    const session = { access_token: "tok", user: { id: "u1" } };
    mockGetSession.mockResolvedValue({ data: { session } });
    vi.mocked(fetchMyGroup).mockResolvedValue(null);
    renderWithAuth();
    await waitFor(() =>
      expect(screen.getByText("authenticated:no-group")).toBeInTheDocument(),
    );
  });

  it("onAuthStateChange でセッション更新時にグループを再取得する", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    let stateCallback: (event: string, session: unknown) => void = () => {};
    mockOnAuthStateChange.mockImplementation((cb) => {
      stateCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    vi.mocked(fetchMyGroup).mockResolvedValue({
      groupId: "g1",
      name: "我が家",
      role: "member",
    });

    renderWithAuth();
    await waitFor(() =>
      expect(screen.getByText("anonymous:no-group")).toBeInTheDocument(),
    );

    // SIGNED_IN イベントをシミュレート
    stateCallback("SIGNED_IN", { access_token: "tok2", user: { id: "u1" } });

    await waitFor(() =>
      expect(screen.getByText("authenticated:我が家")).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run src/contexts/AuthContext.test.tsx
```

Expected: FAIL（モジュール未存在）

- [ ] **Step 3: AuthContext を実装する**

`frontend/src/contexts/AuthContext.tsx`:

```typescript
"use client";

import { fetchMyGroup } from "@/lib/authApi";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { GroupInfo } from "@/types/group";
import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

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
      value={{ session, user, group, loading, signInWithGoogle, signOut, refreshGroup }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
```

- [ ] **Step 4: テストを実行して全て通ることを確認する**

```bash
npx vitest run src/contexts/AuthContext.test.tsx
```

Expected: PASS（全テスト）

- [ ] **Step 5: コミット**

```bash
git add frontend/src/contexts/AuthContext.tsx frontend/src/contexts/AuthContext.test.tsx
git commit -m "Add AuthContext with Supabase session and group management"
```

---

## Task 5: AuthGuard の作成

**Files:**
- Create: `frontend/src/components/AuthGuard.tsx`
- Create: `frontend/src/components/AuthGuard.test.tsx`

- [ ] **Step 1: テストを作成する（失敗させる）**

`frontend/src/components/AuthGuard.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AuthGuard from "./AuthGuard";

vi.mock("@/contexts/AuthContext");
vi.mock("@/lib/supabaseClient");
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

const mockPush = vi.fn();

afterEach(() => {
  vi.clearAllMocks();
});

function setup(auth: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    session: null,
    user: null,
    group: null,
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshGroup: vi.fn(),
    ...auth,
  });
  vi.mocked(useRouter).mockReturnValue({ push: mockPush } as never);
}

describe("AuthGuard", () => {
  it("Supabase 未設定のとき children をそのまま表示する（auth 無効モード）", () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    setup({});
    render(<AuthGuard><span>content</span></AuthGuard>);
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("loading=true のとき children を表示しない", () => {
    vi.mocked(getSupabaseClient).mockReturnValue({} as never);
    setup({ loading: true });
    render(<AuthGuard><span>content</span></AuthGuard>);
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("未認証のとき /login へリダイレクトする", () => {
    vi.mocked(getSupabaseClient).mockReturnValue({} as never);
    setup({ session: null });
    render(<AuthGuard><span>content</span></AuthGuard>);
    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("認証済み・グループ未所属のとき /no-group へリダイレクトする", () => {
    vi.mocked(getSupabaseClient).mockReturnValue({} as never);
    setup({ session: { access_token: "tok" } as never, group: null });
    render(<AuthGuard><span>content</span></AuthGuard>);
    expect(mockPush).toHaveBeenCalledWith("/no-group");
  });

  it("認証済み・グループ所属のとき children を表示する", () => {
    vi.mocked(getSupabaseClient).mockReturnValue({} as never);
    setup({
      session: { access_token: "tok" } as never,
      group: { groupId: "g1", name: "家", role: "owner" },
    });
    render(<AuthGuard><span>content</span></AuthGuard>);
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run src/components/AuthGuard.test.tsx
```

Expected: FAIL（モジュール未存在）

- [ ] **Step 3: AuthGuard を実装する**

`frontend/src/components/AuthGuard.tsx`:

```typescript
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, group, loading } = useAuth();
  const router = useRouter();
  const authEnabled = getSupabaseClient() !== null;

  useEffect(() => {
    if (!authEnabled || loading) return;
    if (!session) {
      router.push("/login");
      return;
    }
    if (!group) {
      router.push("/no-group");
    }
  }, [authEnabled, loading, session, group, router]);

  if (!authEnabled) return <>{children}</>;
  if (loading) return null;
  if (!session || !group) return null;

  return <>{children}</>;
}
```

- [ ] **Step 4: テストを実行して全て通ることを確認する**

```bash
npx vitest run src/components/AuthGuard.test.tsx
```

Expected: PASS（全テスト）

- [ ] **Step 5: コミット**

```bash
git add frontend/src/components/AuthGuard.tsx frontend/src/components/AuthGuard.test.tsx
git commit -m "Add AuthGuard component for route protection"
```

---

## Task 6: /login ページの作成

**Files:**
- Create: `frontend/src/app/login/page.tsx`

- [ ] **Step 1: ログインページを作成する**

`frontend/src/app/login/page.tsx`:

```typescript
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LoginPage() {
  const { session, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && session) {
      router.push("/stock-items");
    }
  }, [loading, session, router]);

  if (loading) return null;
  if (session) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6">
      <h1 className="text-3xl font-bold text-[#00d1b2]">Pantry Panel</h1>
      <p className="text-gray-600">家族の食品・日用品を管理する</p>
      <button
        type="button"
        onClick={() => signInWithGoogle()}
        className="flex items-center gap-3 bg-white border border-gray-300 rounded-lg px-6 py-3 text-gray-700 font-medium shadow-sm hover:bg-gray-50"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Googleでサインイン
      </button>
    </div>
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add frontend/src/app/login/page.tsx
git commit -m "Add login page with Google sign-in button"
```

---

## Task 7: /no-group ページの作成

**Files:**
- Create: `frontend/src/app/no-group/page.tsx`

- [ ] **Step 1: ページを作成する**

`frontend/src/app/no-group/page.tsx`:

```typescript
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { createGroup } from "@/lib/authApi";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NoGroupPage() {
  const { session, signOut, refreshGroup } = useAuth();
  const router = useRouter();
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateGroup = async () => {
    if (!session || !groupName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createGroup(groupName.trim(), session.access_token);
      await refreshGroup();
      router.push("/stock-items");
    } catch {
      setError("グループの作成に失敗しました");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold text-[#00d1b2]">Pantry Panel</h1>
      <p className="text-gray-600 text-center">
        グループに所属していません。
        <br />
        招待リンクをお持ちの方はリンクを踏んでください。
      </p>

      <div className="bg-white rounded-lg border border-gray-200 p-6 w-full max-w-sm space-y-3">
        <p className="text-sm font-medium text-gray-700">
          新しいグループを作成する
        </p>
        <input
          type="text"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="グループ名（例: 我が家）"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="button"
          onClick={handleCreateGroup}
          disabled={creating || !groupName.trim()}
          className="w-full bg-[#00d1b2] hover:bg-[#00c4a7] disabled:opacity-50 text-white rounded px-4 py-2 text-sm font-medium"
        >
          {creating ? "作成中..." : "グループを作成"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => signOut()}
        className="text-sm text-gray-400 hover:text-gray-600"
      >
        サインアウト
      </button>
    </div>
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add frontend/src/app/no-group/page.tsx
git commit -m "Add no-group page for users without group membership"
```

---

## Task 8: /join ページの作成

**Files:**
- Create: `frontend/src/app/join/page.tsx`

`/join?token=<uuid>` は招待リンクの着地ページ。未ログインの場合は Google 認証後に同じ URL に戻り、自動で招待を承認する。

- [ ] **Step 1: ページを作成する**

`frontend/src/app/join/page.tsx`:

```typescript
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { acceptInvitation } from "@/lib/authApi";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Status = "loading" | "accepting" | "success" | "error" | "invalid";

function JoinContent() {
  const { session, loading, signInWithGoogle } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    if (loading) return;

    if (!session) {
      setStatus("loading"); // 認証待ち（ボタンを表示する）
      return;
    }

    // セッションがある → 招待を承認する
    setStatus("accepting");
    acceptInvitation(token, session.access_token)
      .then(() => {
        setStatus("success");
        // refreshGroup は不要（/stock-items に遷移すれば AuthContext が再取得する）
        router.push("/stock-items");
      })
      .catch((err: Error) => {
        setStatus("error");
        if (err.message.includes("410")) {
          setErrorMessage("この招待リンクは期限切れです。新しいリンクを発行してもらってください。");
        } else if (err.message.includes("404")) {
          setErrorMessage("招待リンクが見つかりませんでした。");
        } else {
          setErrorMessage("参加に失敗しました。しばらく待ってから再試行してください。");
        }
      });
  }, [token, session, loading, router]);

  if (!token || status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">無効な招待リンクです。</p>
      </div>
    );
  }

  if (status === "accepting" || status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">グループに参加しています...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4">
        <p className="text-red-500">{errorMessage}</p>
        <button
          type="button"
          onClick={() => router.push("/no-group")}
          className="text-sm text-[#00d1b2] underline"
        >
          グループページへ戻る
        </button>
      </div>
    );
  }

  // 未ログイン → サインインボタンを表示
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-bold text-[#00d1b2]">Pantry Panel</h1>
      <p className="text-gray-600">グループへの招待を受け取りました</p>
      <button
        type="button"
        onClick={() =>
          signInWithGoogle(
            typeof window !== "undefined" ? window.location.href : undefined,
          )
        }
        className="flex items-center gap-3 bg-white border border-gray-300 rounded-lg px-6 py-3 text-gray-700 font-medium shadow-sm hover:bg-gray-50"
      >
        Googleでサインインして参加する
      </button>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinContent />
    </Suspense>
  );
}
```

**Note:** `useSearchParams()` は Next.js App Router で Suspense でラップする必要がある。

- [ ] **Step 2: コミット**

```bash
git add frontend/src/app/join/page.tsx
git commit -m "Add join page for invitation token acceptance"
```

---

## Task 9: /invite ページの作成

**Files:**
- Create: `frontend/src/app/invite/page.tsx`

グループオーナーが招待リンクを生成してコピーするページ。

- [ ] **Step 1: ページを作成する**

`frontend/src/app/invite/page.tsx`:

```typescript
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { createInvitation } from "@/lib/authApi";
import type { InvitationResponse } from "@/types/group";
import { useState } from "react";

export default function InvitePage() {
  const { session } = useAuth();
  const [invitation, setInvitation] = useState<InvitationResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const inviteUrl = invitation
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/join?token=${invitation.token}`
    : "";

  const handleGenerate = async () => {
    if (!session) return;
    setGenerating(true);
    setError(null);
    try {
      const inv = await createInvitation(session.access_token);
      setInvitation(inv);
    } catch {
      setError("招待リンクの生成に失敗しました");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold text-[#00d1b2]">招待リンクを生成</h1>
      <p className="text-gray-600 text-center text-sm">
        リンクは7日間有効です。家族に送ってグループに招待してください。
      </p>

      {!invitation ? (
        <>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="bg-[#00d1b2] hover:bg-[#00c4a7] disabled:opacity-50 text-white rounded px-6 py-2 font-medium"
          >
            {generating ? "生成中..." : "招待リンクを生成する"}
          </button>
        </>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-4 w-full max-w-md space-y-3">
          <p className="text-xs text-gray-500 break-all">{inviteUrl}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 bg-[#00d1b2] hover:bg-[#00c4a7] text-white rounded px-4 py-2 text-sm font-medium"
            >
              {copied ? "コピー済み ✓" : "URLをコピー"}
            </button>
            <button
              type="button"
              onClick={() => { setInvitation(null); setCopied(false); }}
              className="text-sm text-gray-400 hover:text-gray-600 px-3"
            >
              再生成
            </button>
          </div>
          <p className="text-xs text-gray-400">
            有効期限: {new Date(invitation.expiresAt).toLocaleDateString("ja-JP")}
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add frontend/src/app/invite/page.tsx
git commit -m "Add invite page for generating invitation links"
```

---

## Task 10: layout.tsx を更新する

**Files:**
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 1: AuthProvider でラップする**

`frontend/src/app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/contexts/AuthContext";
import "./globals.css";

// ... fonts の定義はそのまま ...

export const metadata: Metadata = { /* ... そのまま ... */ };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: ビルドエラーがないことを確認する**

```bash
cd frontend
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add frontend/src/app/layout.tsx
git commit -m "Wrap app layout with AuthProvider"
```

---

## Task 11: stock-items/page.tsx を更新する

**Files:**
- Modify: `frontend/src/app/stock-items/page.tsx`

- [ ] **Step 1: AuthGuard・useAuth・トークン付き API 呼び出しを追加する**

`frontend/src/app/stock-items/page.tsx` に以下の変更を加える:

**インポートに追加:**
```typescript
import AuthGuard from "@/components/AuthGuard";
import { useAuth } from "@/contexts/AuthContext";
```

**コンポーネント内 state/hooks の先頭に追加:**
```typescript
const { session, group, signOut } = useAuth();
const accessToken = session?.access_token;
```

**全 API 呼び出しに accessToken を渡す:**
```typescript
// fetchStockItems() → fetchStockItems(accessToken)
// createStockItem(req) → createStockItem(req, accessToken)
// updateStockItem(id, req) → updateStockItem(id, req, accessToken)
// deleteStockItem(id) → deleteStockItem(id, accessToken)
// searchImages(query) → searchImages(query, 10, accessToken)
```

**ヘッダーを更新する（グループ名 + サインアウト + 招待ボタン）:**
```typescript
<header className="bg-gradient-to-br from-[#009e6c] via-[#00d1b2] to-[#00e7eb] text-white py-2 px-4">
  <div className="max-w-6xl mx-auto flex items-center justify-between">
    <h1 className="text-2xl font-bold">Pantry Panel</h1>
    <div className="flex items-center gap-3 text-sm">
      {group && <span className="opacity-80">{group.name}</span>}
      {group?.role === "owner" && (
        <a href="/invite" className="opacity-80 hover:opacity-100 underline">
          招待
        </a>
      )}
      <button
        type="button"
        onClick={() => signOut()}
        className="opacity-80 hover:opacity-100"
      >
        サインアウト
      </button>
    </div>
  </div>
</header>
```

**return 文全体を AuthGuard でラップする:**
```typescript
return (
  <AuthGuard>
    <div className="min-h-screen bg-gray-50">
      {/* ... 既存の JSX ... */}
    </div>
  </AuthGuard>
);
```

- [ ] **Step 2: 型チェックとテストが通ることを確認する**

```bash
cd frontend
npx tsc --noEmit
npx vitest run src/app/stock-items/
```

Expected: エラーなし、PASS

- [ ] **Step 3: コミット**

```bash
git add frontend/src/app/stock-items/page.tsx
git commit -m "Add AuthGuard and auth token to stock-items page"
```

---

## Task 12: Supabase Auth の設定と動作確認

このタスクは**コードを書かない**。Supabase Dashboard での設定と、ローカルでの動作確認を行う。

- [ ] **Step 1: Supabase Dashboard で Google プロバイダーを有効にする**

Supabase Dashboard → Authentication → Providers → Google

必要なもの:
- Google Cloud Console で OAuth 2.0 クライアント ID を作成
  - 承認済みリダイレクト URI: `https://<project-ref>.supabase.co/auth/v1/callback`
- Supabase に Client ID / Client Secret を設定して保存

- [ ] **Step 2: リダイレクト URL を許可リストに追加する**

Supabase Dashboard → Authentication → URL Configuration → Redirect URLs に追加:

```
http://localhost:3000/**
https://pantry-panel-xi.vercel.app/**
```

- [ ] **Step 3: ローカルで動作確認する**

```bash
# バックエンドを起動（SUPABASE_JWKS_URL はまだ未設定でよい）
cd backend && go run .

# フロントエンドを起動
cd frontend && npm run dev
```

http://localhost:3000 を開いて以下を確認:
1. `/stock-items` にアクセス → Supabase 未設定なら従来通り表示される（auth 無効モード）
2. `NEXT_PUBLIC_SUPABASE_*` を `.env.local` に設定して再起動 → `/login` にリダイレクトされる
3. "Googleでサインイン" → OAuth フロー → `/stock-items` に戻る
4. ヘッダーにグループ名・サインアウトボタンが表示される（グループ未作成なら `/no-group` へ）
5. `/no-group` でグループ名を入力して作成 → `/stock-items` に遷移

- [ ] **Step 4: CI テストを確認する**

```bash
cd frontend && npx vitest run
```

Expected: PASS（全テスト）

- [ ] **Step 5: バックエンドに SUPABASE_JWKS_URL を設定して E2E 確認**

```bash
# .env.local に追加
SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/keys

# バックエンドを再起動して /api/stock-items が 401 を返すことを確認
curl http://localhost:8080/api/stock-items
# → {"message":"Unauthorized"}

# ログイン後のトークンで呼ぶと 200 が返ることを確認（ブラウザの DevTools で token を取得）
curl -H "Authorization: Bearer <token>" http://localhost:8080/api/stock-items
# → []
```

- [ ] **Step 6: ブランチをプッシュして CI を確認する**

```bash
git push origin 79-google-auth
```

GitHub Actions の CI (Biome → tsc → Vitest / golangci-lint → go test) が PASS することを確認する。

- [ ] **Step 7: Plan B 完了**

Plan C（Data Migration）に進む前に、バックエンドへの `SUPABASE_JWKS_URL` の本番設定と Supabase Auth の設定が完了していることを確認する。
