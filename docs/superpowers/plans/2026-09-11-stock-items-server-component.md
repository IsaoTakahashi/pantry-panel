# stock-items Server Component化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed stock-items' initial data in the server-rendered HTML (via a cookie-mirrored active group id and an auth-bootstrap chain that lets `AuthGuard` paint on the first render) so `skeleton → 商品表示` latency approaches zero, without breaking existing auth/group-selection/realtime/write-handler race guards.

**Architecture:** `middleware.ts` marks authenticated requests with a request header; `layout.tsx` (now async) reads that header plus a new `pantry-panel-active-group` cookie and seeds `AuthProvider`'s initial state; `AuthGuard`'s render gate is relaxed to trust that seed instead of waiting for client-side `getSession()`/`getMyGroups()` to resolve; `stock-items/page.tsx` (now async) independently re-verifies the session server-side and fetches items via the existing `fetchStockItems()` (isomorphic `fetch`, works server-side unmodified), passing the result into `StockItemsClient`/`useStockItems` as `initialItems`.

**Tech Stack:** Next.js App Router (Server Components, `next/headers`), `@supabase/ssr`, React 19, Vitest + React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-11-stock-items-server-component-design.md` (Decisions D1–D6). Executors should read D1–D6 in full before their task — this plan implements them but does not restate every rationale.

## Global Constraints

- Cookie name: `pantry-panel-active-group` (D1). `path=/`, `SameSite=Lax`, `maxAge` = 365 days, **not** `httpOnly`.
- `localStorage` key `pantry-panel:active-group-id` stays; cookie is written alongside it, never instead of it (D1 Non-Goal).
- Do **not** change `loading`'s meaning, its initial value, or `AuthGuard`'s `/no-group` redirect `useEffect` (D5 — this is the corrected constraint; violating it reintroduces a premature-redirect bug).
- Server-side session read for item-fetching purposes must use `getSession()`, not `getClaims()` (D2 correction — `getClaims()` does not return the raw access token).
- No new context field beyond `initialAuthenticated: boolean` and `initialGroupId: string | undefined` (D5 — no `groupsConfirmed` or similar).
- Commit messages: English, under 100 chars, no `Co-Authored-By` line needed (the harness adds it automatically).
- Every commit's tests must pass locally before moving to the next task.

---

## Task 1: Active group cookie helper

**Files:**
- Create: `frontend/src/lib/activeGroupCookie.ts`
- Test: `frontend/src/lib/activeGroupCookie.test.ts`

**Interfaces:**
- Produces: `ACTIVE_GROUP_COOKIE_NAME = "pantry-panel-active-group"`, `setActiveGroupCookie(groupId: string): void`, `getActiveGroupCookie(): string | undefined` — all consumed by Task 4 (`AuthContext.tsx`).

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/lib/activeGroupCookie.test.ts
import { afterEach, describe, expect, it } from "vitest";
import {
  ACTIVE_GROUP_COOKIE_NAME,
  getActiveGroupCookie,
  setActiveGroupCookie,
} from "./activeGroupCookie";

afterEach(() => {
  document.cookie = `${ACTIVE_GROUP_COOKIE_NAME}=; path=/; max-age=0`;
});

describe("activeGroupCookie", () => {
  it("ACTIVE_GROUP_COOKIE_NAME is the shared cookie name", () => {
    expect(ACTIVE_GROUP_COOKIE_NAME).toBe("pantry-panel-active-group");
  });

  it("getActiveGroupCookie returns undefined when no cookie is set", () => {
    expect(getActiveGroupCookie()).toBeUndefined();
  });

  it("setActiveGroupCookie writes a cookie readable by getActiveGroupCookie", () => {
    setActiveGroupCookie("group-123");
    expect(getActiveGroupCookie()).toBe("group-123");
  });

  it("setActiveGroupCookie overwrites a previous value", () => {
    setActiveGroupCookie("group-1");
    setActiveGroupCookie("group-2");
    expect(getActiveGroupCookie()).toBe("group-2");
  });

  it("getActiveGroupCookie ignores unrelated cookies", () => {
    document.cookie = "unrelated=value; path=/";
    expect(getActiveGroupCookie()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/activeGroupCookie.test.ts`
Expected: FAIL with "Cannot find module './activeGroupCookie'" (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
// frontend/src/lib/activeGroupCookie.ts

// アクティブグループIDをブラウザ cookie にも保存する（D1）。サーバー側
// （layout.tsx, stock-items/page.tsx）が localStorage を読めないため、
// SSR で正しい初期グループを選ぶには cookie が必要。グループIDは秘密情報
// ではない（認可は引き続きAPI側がアクセストークン+groupIdで検証する）ため
// httpOnly にはしない — クライアントJSが書き込む必要がある。
export const ACTIVE_GROUP_COOKIE_NAME = "pantry-panel-active-group";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export function setActiveGroupCookie(groupId: string): void {
  document.cookie = `${ACTIVE_GROUP_COOKIE_NAME}=${encodeURIComponent(groupId)}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}

export function getActiveGroupCookie(): string | undefined {
  const prefix = `${ACTIVE_GROUP_COOKIE_NAME}=`;
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(prefix));
  if (!match) return undefined;
  return decodeURIComponent(match.slice(prefix.length));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/activeGroupCookie.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/activeGroupCookie.ts frontend/src/lib/activeGroupCookie.test.ts
git commit -m "feat(auth): add active-group cookie read/write helper"
git push
```

---

## Task 2: middleware.ts authenticated-request header

**Files:**
- Modify: `frontend/src/middleware.ts`
- Modify: `frontend/src/middleware.test.ts`

**Interfaces:**
- Produces: `x-pp-authenticated: 1` request header on protected requests where `getClaims()` resolved with `data !== null`. Consumed by Task 3 (`layout.tsx`).

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/middleware.test.ts` (inside the existing `describe("middleware", ...)` block, alongside the other `it(...)` cases — reuse the existing `getClaimsMock`/`makeRequest` from the top of the file):

```typescript
  // S-10 (Issue #182): 認証済みと判定できたリクエストには、layout.tsx が
  // AuthProvider の初期状態を組み立てるための x-pp-authenticated ヘッダーを
  // 付与する。Server Component は middleware の判定結果を直接読めないため、
  // request.headers 経由で明示的に転送する必要がある。
  it("S-10: 認証済みのとき request.headers に x-pp-authenticated: 1 がセットされる", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-1" } },
      error: null,
    });
    const { middleware } = await import("./middleware");

    const req = makeRequest("/stock-items");
    await middleware(req);

    expect(req.headers.get("x-pp-authenticated")).toBe("1");
  });

  it("S-10: 未ログイン確定（data===null, error===null）のとき x-pp-authenticated を付与しない", async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: null });
    const { middleware } = await import("./middleware");

    const req = makeRequest("/stock-items");
    await middleware(req);

    expect(req.headers.get("x-pp-authenticated")).toBeNull();
  });

  it("S-10: /login は除外ルートなので x-pp-authenticated は付与されない（getClaims自体呼ばれない）", async () => {
    const { middleware } = await import("./middleware");

    const req = makeRequest("/login");
    await middleware(req);

    expect(req.headers.get("x-pp-authenticated")).toBeNull();
    expect(getClaimsMock).not.toHaveBeenCalled();
  });
```

These 3 `it(...)` blocks are the complete diff for this step.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/middleware.test.ts`
Expected: FAIL — only the first new test fails (`x-pp-authenticated` is `null` when it should be `"1"`, since the current implementation never sets this header). The other two new tests assert the header is absent, which is already true of the unmodified code — they pass now and must keep passing after the implementation step (they pin the "don't set it for unauthenticated/excluded paths" half of the behavior).

- [ ] **Step 3: Implement in `middleware.ts`**

Add a tracking variable next to `isDefinitelyUnauthenticated` and set the header once authentication is confirmed. Edit the `try` block (around the existing `const { data, error } = await supabase.auth.getClaims();` line):

```typescript
  let isDefinitelyUnauthenticated = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (data !== null) {
      // 認証済みと判定できた事実を Server Component（layout.tsx）へ転送する
      // （Issue #182）。middleware は request/response のライフサイクルの中で
      // 唯一 getClaims() を呼んで検証する場所であり、下流の Server Component
      // が同じ検証をもう一度行う（＝二重のネットワーク呼び出し）のを避ける
      // ため、ヘッダー経由で結果だけを渡す。
      request.headers.set("x-pp-authenticated", "1");
      response = NextResponse.next({ request });
    } else if (data === null && error === null) {
      isDefinitelyUnauthenticated = true;
    } else if (data === null && error !== null) {
```

Note: this changes `if (data === null && error === null)` to `else if (...)` since the new `if (data !== null)` branch now comes first — the rest of the `else if` chain is otherwise unchanged. Verify the full updated block reads:

```typescript
    const { data, error } = await supabase.auth.getClaims();
    if (data !== null) {
      request.headers.set("x-pp-authenticated", "1");
      response = NextResponse.next({ request });
    } else if (data === null && error === null) {
      isDefinitelyUnauthenticated = true;
    } else if (data === null && error !== null) {
      if (
        isAuthRetryableFetchError(error) ||
        isAuthRefreshDiscardedError(error)
      ) {
        console.error(
          "middleware: getClaims resolved with an error, failing open (session refresh not confirmed)",
          error,
        );
      } else {
        console.error(
          "middleware: getClaims resolved with a definitively invalid error, redirecting to /login",
          error,
        );
        isDefinitelyUnauthenticated = true;
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/middleware.test.ts`
Expected: PASS (all tests, including the 3 new ones and every pre-existing one — confirm no regression in the S-3/S-7/S-8/S-9 suites).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/middleware.ts frontend/src/middleware.test.ts
git commit -m "feat(auth): forward x-pp-authenticated header for confirmed sessions"
git push
```

---

## Task 3: Server-side auth bootstrap + async root layout

**Files:**
- Create: `frontend/src/lib/serverAuthBootstrap.ts`
- Test: `frontend/src/lib/serverAuthBootstrap.test.ts`
- Modify: `frontend/src/app/layout.tsx`

**Interfaces:**
- Consumes: `ACTIVE_GROUP_COOKIE_NAME` from Task 1.
- Produces: `getServerAuthBootstrap(): Promise<{ initialAuthenticated: boolean; initialGroupId: string | undefined }>` — consumed by `layout.tsx`, and by Task 4 (`AuthProvider` props).

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/lib/serverAuthBootstrap.test.ts
import { describe, expect, it, vi } from "vitest";

const mockHeadersGet = vi.fn();
const mockCookiesGet = vi.fn();

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({ get: mockHeadersGet }),
  cookies: () => Promise.resolve({ get: mockCookiesGet }),
}));

describe("getServerAuthBootstrap", () => {
  it("returns initialAuthenticated=true when x-pp-authenticated header is '1'", async () => {
    mockHeadersGet.mockImplementation((name: string) =>
      name === "x-pp-authenticated" ? "1" : null,
    );
    mockCookiesGet.mockReturnValue(undefined);
    const { getServerAuthBootstrap } = await import("./serverAuthBootstrap");

    const result = await getServerAuthBootstrap();

    expect(result.initialAuthenticated).toBe(true);
  });

  it("returns initialAuthenticated=false when header is absent", async () => {
    mockHeadersGet.mockReturnValue(null);
    mockCookiesGet.mockReturnValue(undefined);
    const { getServerAuthBootstrap } = await import("./serverAuthBootstrap");

    const result = await getServerAuthBootstrap();

    expect(result.initialAuthenticated).toBe(false);
  });

  it("returns initialGroupId from the active-group cookie when present", async () => {
    mockHeadersGet.mockReturnValue("1");
    mockCookiesGet.mockImplementation((name: string) =>
      name === "pantry-panel-active-group" ? { value: "group-42" } : undefined,
    );
    const { getServerAuthBootstrap } = await import("./serverAuthBootstrap");

    const result = await getServerAuthBootstrap();

    expect(result.initialGroupId).toBe("group-42");
  });

  it("returns initialGroupId=undefined when the cookie is absent", async () => {
    mockHeadersGet.mockReturnValue("1");
    mockCookiesGet.mockReturnValue(undefined);
    const { getServerAuthBootstrap } = await import("./serverAuthBootstrap");

    const result = await getServerAuthBootstrap();

    expect(result.initialGroupId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/serverAuthBootstrap.test.ts`
Expected: FAIL with "Cannot find module './serverAuthBootstrap'".

- [ ] **Step 3: Write the implementation**

```typescript
// frontend/src/lib/serverAuthBootstrap.ts
import { cookies, headers } from "next/headers";
import { ACTIVE_GROUP_COOKIE_NAME } from "@/lib/activeGroupCookie";

export type ServerAuthBootstrap = {
  initialAuthenticated: boolean;
  initialGroupId: string | undefined;
};

// middleware.ts が付与した x-pp-authenticated ヘッダーと、cookie に保存された
// アクティブグループIDを読み、AuthProvider の初期状態を組み立てる（Issue #182）。
// ここで getClaims()/getSession() を呼び直さない — middleware が既に検証済みの
// 結果をヘッダー経由で受け取るだけであり、二重のネットワーク呼び出しを避ける。
export async function getServerAuthBootstrap(): Promise<ServerAuthBootstrap> {
  const headerList = await headers();
  const cookieStore = await cookies();

  const initialAuthenticated = headerList.get("x-pp-authenticated") === "1";
  const initialGroupId = cookieStore.get(ACTIVE_GROUP_COOKIE_NAME)?.value;

  return { initialAuthenticated, initialGroupId };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/serverAuthBootstrap.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire into `layout.tsx`**

Read the current `frontend/src/app/layout.tsx` first (it wraps `{children}` in `<AuthProvider>`). Change:

```typescript
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
```

to:

```typescript
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { initialAuthenticated, initialGroupId } =
    await getServerAuthBootstrap();
```

and add the import:

```typescript
import { getServerAuthBootstrap } from "@/lib/serverAuthBootstrap";
```

and change the provider usage from:

```typescript
          <AuthProvider>{children}</AuthProvider>
```

to:

```typescript
          <AuthProvider
            initialAuthenticated={initialAuthenticated}
            initialGroupId={initialGroupId}
          >
            {children}
          </AuthProvider>
```

(`AuthProvider`'s props type is extended in Task 4 — this task's edit will not typecheck cleanly until Task 4 lands; that's expected within this plan's dependency order. If executing task-by-task with CI running in between, note this in the task's PR-stage commit message, or land Tasks 3 and 4 in the same push. Given both are needed for `npm run build`/`tsc` to pass, run Task 4 immediately after this step before considering Task 3 "done" for CI purposes.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/serverAuthBootstrap.ts frontend/src/lib/serverAuthBootstrap.test.ts frontend/src/app/layout.tsx
git commit -m "feat(auth): add serverAuthBootstrap and make root layout async"
git push
```

(`tsc`/build will fail until Task 4 adds the new `AuthProvider` props — this is acceptable mid-plan; do not skip pushing, but flag in the code-review stage if this task is reviewed in isolation before Task 4 lands. If using subagent-driven-development with per-task review gates, merge Tasks 3+4 into a single review unit instead of gating separately.)

---

## Task 4: AuthContext — initial state, cookie write, initialGroupId rename

**Files:**
- Modify: `frontend/src/contexts/AuthContext.tsx`
- Modify: `frontend/src/contexts/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `setActiveGroupCookie`, `getActiveGroupCookie` (Task 1).
- Produces: `AuthProvider` props `{ initialAuthenticated?: boolean; initialGroupId?: string }`; `AuthContextValue.initialGroupId: string | undefined` (renamed from `speculativeGroupId`); `AuthContextValue.initialAuthenticated: boolean` — consumed by Task 5 (`AuthGuard`) and Task 7 (`StockItemsClient`).

- [ ] **Step 1: Rename `speculativeGroupId` → `initialGroupId` across the test file first (mechanical, RED by construction)**

In `frontend/src/contexts/AuthContext.test.tsx`, replace every occurrence of `speculativeGroupId` with `initialGroupId` (this includes the `SpeculativeCaptureHandle` type/variable names — rename those too, to `InitialGroupCaptureHandle` / `captured`, matching the file's existing naming so a fresh reader isn't confused by a stale "speculative" name next to the new field). Also rename the test at line ~355 ("mount 時に localStorage の active group id を speculativeGroupId として同期的に公開する") to describe cookie-based initialization instead — see Step 3 below for the updated test body.

Run: `cd frontend && npx vitest run src/contexts/AuthContext.test.tsx`
Expected: FAIL (context doesn't expose `initialGroupId`, compile/type errors on the renamed identifiers).

- [ ] **Step 2: Add new tests for `initialAuthenticated`/`initialGroupId` props and cookie writes**

Add to `frontend/src/contexts/AuthContext.test.tsx`:

```typescript
  it("initialAuthenticated=true を渡すと session 解決前でも AuthGuard 判定用の initialAuthenticated が true になる", () => {
    let captured: { initialAuthenticated: boolean } | null = null;
    function Capture() {
      const { initialAuthenticated } = useAuth();
      captured = { initialAuthenticated };
      return null;
    }
    render(
      <AuthProvider initialAuthenticated initialGroupId={undefined}>
        <Capture />
      </AuthProvider>,
    );
    expect(captured).toEqual({ initialAuthenticated: true });
  });

  it("initialGroupId を渡すと context の initialGroupId に反映される", () => {
    let captured: { initialGroupId: string | undefined } | null = null;
    function Capture() {
      const { initialGroupId } = useAuth();
      captured = { initialGroupId };
      return null;
    }
    render(
      <AuthProvider initialAuthenticated={false} initialGroupId="ssr-group-1">
        <Capture />
      </AuthProvider>,
    );
    expect(captured).toEqual({ initialGroupId: "ssr-group-1" });
  });

  it("switchGroup は active group cookie も書き込む", async () => {
    const groups: GroupInfo[] = [
      { groupId: "g1", name: "家1", role: "owner" },
      { groupId: "g2", name: "家2", role: "owner" },
    ];
    vi.mocked(getSupabaseClient).mockResolvedValue(mockClient as never);
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    vi.mocked(fetchMyGroups).mockResolvedValue(groups);

    let handle: { switchGroup: (id: string) => void } | null = null;
    function Capture() {
      const { switchGroup } = useAuth();
      handle = { switchGroup };
      return null;
    }
    render(
      <AuthProvider initialAuthenticated={false} initialGroupId={undefined}>
        <Capture />
      </AuthProvider>,
    );
    await waitFor(() => expect(handle).not.toBeNull());

    act(() => {
      (handle as unknown as { switchGroup: (id: string) => void }).switchGroup(
        "g2",
      );
    });

    expect(document.cookie).toContain("pantry-panel-active-group=g2");
  });

  it("マウント時、cookie未設定・localStorageに既存値がある場合は一度だけcookieへ移行する", async () => {
    localStorage.setItem("pantry-panel:active-group-id", "legacy-group");
    vi.mocked(getSupabaseClient).mockResolvedValue(mockClient as never);
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    render(
      <AuthProvider initialAuthenticated={false} initialGroupId={undefined}>
        <span>child</span>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(document.cookie).toContain(
        "pantry-panel-active-group=legacy-group",
      ),
    );
  });
```

Add the needed import at the top of the test file: `import { ACTIVE_GROUP_COOKIE_NAME } from "@/lib/activeGroupCookie";` is not strictly required (tests above assert on `document.cookie` directly), so skip it unless a step below needs it.

Add a cookie-clearing `afterEach` alongside the existing `localStorage.clear()` ones (there are two `afterEach`-like `localStorage.clear()` calls at lines ~115 and ~120 — check both `beforeEach`/`afterEach` blocks and add `document.cookie = "pantry-panel-active-group=; path=/; max-age=0";` next to each):

- [ ] **Step 3: Update the localStorage-restoration test to also cover cookie precedence**

Find the existing test "mount 時に localStorage の active group id を speculativeGroupId として同期的に公開する" (now renamed per Step 1) and update its body so it asserts on `initialGroupId` instead of `speculativeGroupId`, keeping the same localStorage-based assertion (this is the fallback path when no SSR `initialGroupId` prop was provided — i.e. `<AuthProvider initialGroupId={undefined}>` and no cookie existed server-side, so the client falls back to localStorage, same as today's speculative-read behavior, just under the new name).

Run: `cd frontend && npx vitest run src/contexts/AuthContext.test.tsx`
Expected: FAIL (new tests fail — `AuthProvider` doesn't accept the new props yet, `switchGroup` doesn't write the cookie yet).

- [ ] **Step 4: Implement in `AuthContext.tsx`**

Add the import:

```typescript
import {
  ACTIVE_GROUP_COOKIE_NAME,
  getActiveGroupCookie,
  setActiveGroupCookie,
} from "@/lib/activeGroupCookie";
```

Change the `AuthContextValue` type: rename `speculativeGroupId: string | undefined;` to `initialGroupId: string | undefined;` and add `initialAuthenticated: boolean;`.

Update the default context object (`createContext<AuthContextValue>({...})`): rename `speculativeGroupId: undefined,` to `initialGroupId: undefined,` and add `initialAuthenticated: false,`.

Change `AuthProvider`'s signature:

```typescript
export function AuthProvider({
  children,
  initialAuthenticated = false,
  initialGroupId: initialGroupIdProp,
}: {
  children: React.ReactNode;
  initialAuthenticated?: boolean;
  initialGroupId?: string;
}) {
```

Update the `speculativeGroupId` state initializer (currently reads `localStorage` synchronously) — rename the state variable and setter to `initialGroupId`/`setInitialGroupId`, and prefer the SSR-provided prop over the synchronous `localStorage` read:

```typescript
  // 初期グループIDの決定順序: (1) SSRがcookieから読んで渡した initialGroupIdProp
  // （最も正確、サーバー検証済み）(2) localStorage の同期読み取り（従来の
  // speculativeGroupId 相当のフォールバック — cookie未設定の移行期間や
  // auth無効環境向け）。どちらも無ければ undefined のまま、groups確定を待つ。
  const [initialGroupId, setInitialGroupId] = useState<string | undefined>(
    () =>
      initialGroupIdProp ??
      (typeof window !== "undefined"
        ? (localStorage.getItem(ACTIVE_GROUP_KEY) ?? undefined)
        : undefined),
  );
```

Find every other reference to `speculativeGroupId` in the file (the `applyGroups` callback's `setSpeculativeGroupId(active?.groupId ?? undefined);` call, and `switchGroup`'s `setSpeculativeGroupId(groupId);` call) and rename to `setInitialGroupId`. Update the JSDoc-style comments referencing "Decision 5" and "speculativeGroupId" to say "initialGroupId" (keep the substance of those comments — they still apply, only the name changed).

Add cookie writes alongside the existing `localStorage.setItem(ACTIVE_GROUP_KEY, ...)` calls. In `applyGroups`:

```typescript
    if (active && typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_GROUP_KEY, active.groupId);
      setActiveGroupCookie(active.groupId);
    }
```

In `switchGroup`:

```typescript
      setGroup(target);
      setInitialGroupId(groupId);
      if (typeof window !== "undefined") {
        localStorage.setItem(ACTIVE_GROUP_KEY, groupId);
        setActiveGroupCookie(groupId);
      }
```

Add the one-time migration effect (place it near the top of `AuthProvider`, after the `initialGroupId` state declaration):

```typescript
  // Migration（D1）: cookie未設定・localStorageに既存値があるユーザーの
  // 初回訪問時、一度だけ cookie に書き写す。以降の訪問では SSR が cookie を
  // 読めるようになる。effect は空の依存配列でマウント時に一度だけ実行する。
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (getActiveGroupCookie() !== undefined) return;
    const legacy = localStorage.getItem(ACTIVE_GROUP_KEY);
    if (legacy) setActiveGroupCookie(legacy);
  }, []);
```

Update the `AuthContext.Provider` value object: rename `speculativeGroupId,` to `initialGroupId,` and add `initialAuthenticated,`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/contexts/AuthContext.test.tsx`
Expected: PASS (all renamed + new tests).

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS (this also confirms Task 3's `layout.tsx` edit now typechecks against the new `AuthProvider` props).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/contexts/AuthContext.tsx frontend/src/contexts/AuthContext.test.tsx
git commit -m "feat(auth): seed AuthContext from SSR bootstrap, rename speculativeGroupId"
git push
```

---

## Task 5: AuthGuard — relax the render gate (not the redirect effect)

**Files:**
- Modify: `frontend/src/components/AuthGuard.tsx`
- Modify: `frontend/src/components/AuthGuard.test.tsx`

**Interfaces:**
- Consumes: `initialAuthenticated`, `initialGroupId` from `useAuth()` (Task 4).

- [ ] **Step 1: Rename `speculativeGroupId` in the test file**

In `frontend/src/components/AuthGuard.test.tsx`, rename every `speculativeGroupId` occurrence in the `setup()` mock and test bodies to `initialGroupId`, and add `initialAuthenticated: false` to the default mock object in `setup()` (so existing tests keep their current behavior — `initialAuthenticated` defaults to false unless a test overrides it).

- [ ] **Step 2: Write the new failing tests**

Add to `frontend/src/components/AuthGuard.test.tsx`, inside the `describe("Supabase 有効時", ...)` block:

```typescript
    it("initialAuthenticated と initialGroupId があれば session/group未確定でも children を表示する", () => {
      setup({
        session: null,
        group: null,
        initialAuthenticated: true,
        initialGroupId: "ssr-group-1",
        loading: true,
      });
      render(
        <AuthGuard>
          <span>content</span>
        </AuthGuard>,
      );
      expect(screen.getByText("content")).toBeInTheDocument();
    });

    // D5のピン留めテスト: session確定〜groups確定の間の競合状態で
    // /no-group へ誤ってリダイレクトしないことを確認する。initialAuthenticated
    // により children ゲートは通過するが、/no-group リダイレクト用 useEffect は
    // loading===true の間は発火してはならない（loading は groups確定まで
    // false にならないという既存の不変条件を守る）。
    it("D5: session確定・group未確定・loading=trueのとき、initialGroupIdがあっても/no-groupへリダイレクトしない", () => {
      setup({
        session: { access_token: "tok" } as never,
        group: null,
        initialAuthenticated: true,
        initialGroupId: "ssr-group-1",
        loading: true,
      });
      render(
        <AuthGuard>
          <span>content</span>
        </AuthGuard>,
      );
      expect(screen.getByText("content")).toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });
```

Run: `cd frontend && npx vitest run src/components/AuthGuard.test.tsx`
Expected: FAIL — both new tests fail (children not rendered; current gate is `session && (group || initialGroupId)`, and with `session: null` in the first new test, or `group: null` in the second, the gate does not pass since it doesn't yet consider `initialAuthenticated`).

- [ ] **Step 3: Implement in `AuthGuard.tsx`**

Current gate condition (verify against the file before editing — line ~23):

```typescript
  if (session && (group || speculativeGroupId)) return <>{children}</>;
```

Change to:

```typescript
  const { session, group, initialGroupId, initialAuthenticated, loading } =
    useAuth();
  // ...
  if ((session || initialAuthenticated) && (group || initialGroupId))
    return <>{children}</>;
```

(Update the destructuring at the top of the component from `speculativeGroupId` to `initialGroupId`, and add `initialAuthenticated` to the destructured fields.) Do **not** touch the `useEffect` that redirects to `/no-group` (`if (!authEnabled || loading) return; if (session && !group) { router.push("/no-group"); }`) — leave it byte-for-byte as-is (D5).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/AuthGuard.test.tsx`
Expected: PASS (all tests, including every pre-existing one — confirm the `/no-group` redirect tests still pass unchanged).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AuthGuard.tsx frontend/src/components/AuthGuard.test.tsx
git commit -m "feat(auth): let AuthGuard paint from SSR-confirmed auth+group"
git push
```

---

## Task 6: useStockItems — accept `initialItems`

**Files:**
- Modify: `frontend/src/app/stock-items/useStockItems.ts`
- Modify: `frontend/src/app/stock-items/useStockItems.test.ts`

**Interfaces:**
- Produces: `useStockItems(accessToken, effectiveGroupId, refreshGroup, isGroupConfirmed, initialItems: StockItem[] | null)` — new 5th parameter, consumed by Task 7 (`StockItemsClient`).

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/app/stock-items/useStockItems.test.ts` (check the file's existing `renderHook`/mock setup first and match its conventions — it mocks `@/lib/api`'s `fetchStockItems` the same way `useStockItems.ts` imports it):

```typescript
  it("initialItems が非nullのとき、初回マウント時に items が即座に埋まり loading=false になる", () => {
    const initialItems: StockItem[] = [
      {
        id: "1",
        name: "初期商品",
        category: "調味料",
        imageUrl: null,
        sourceUrl: null,
        wantToBuy: false,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        sortedAt: "2026-01-01T00:00:00Z",
      },
    ];

    const { result } = renderHook(() =>
      useStockItems("token", "group-1", vi.fn(), true, initialItems),
    );

    expect(result.current.items).toEqual(initialItems);
    expect(result.current.loading).toBe(false);
    expect(fetchStockItems).not.toHaveBeenCalled();
  });

  it("initialItems が null のとき、従来通り fetchStockItems が呼ばれる", async () => {
    vi.mocked(fetchStockItems).mockResolvedValue([]);

    renderHook(() => useStockItems("token", "group-1", vi.fn(), true, null));

    await waitFor(() => expect(fetchStockItems).toHaveBeenCalledTimes(1));
  });

  it("initialItems ありでも effectiveGroupId が変わったら再フェッチする", async () => {
    vi.mocked(fetchStockItems).mockResolvedValue([]);
    const initialItems: StockItem[] = [];

    const { rerender } = renderHook(
      ({ groupId }) =>
        useStockItems("token", groupId, vi.fn(), true, initialItems),
      { initialProps: { groupId: "group-1" } },
    );
    expect(fetchStockItems).not.toHaveBeenCalled();

    rerender({ groupId: "group-2" });

    await waitFor(() => expect(fetchStockItems).toHaveBeenCalledTimes(1));
    expect(fetchStockItems).toHaveBeenCalledWith("token", "group-2");
  });
```

Add `import type { StockItem } from "@/types/stockItem";` at the top of the test file if not already present (check first).

Run: `cd frontend && npx vitest run src/app/stock-items/useStockItems.test.ts`
Expected: FAIL — TypeScript error (5th argument doesn't exist yet) or, if TS errors don't fail vitest directly, a runtime mismatch: `items` stays `[]` from the old default and `fetchStockItems` gets called even for the first test.

- [ ] **Step 2: Implement in `useStockItems.ts`**

Change the function signature:

```typescript
export function useStockItems(
  accessToken: string | undefined,
  effectiveGroupId: string | undefined,
  refreshGroup: () => Promise<void>,
  isGroupConfirmed: boolean,
  initialItems: StockItem[] | null,
): UseStockItemsReturn {
```

Change the `items`/`loading` initial state:

```typescript
  const [items, setItems] = useState<StockItem[]>(initialItems ?? []);
  const [loading, setLoading] = useState(initialItems === null);
```

Add a ref to track which `effectiveGroupId` the `initialItems` apply to, so the skip-first-fetch logic only applies once, on mount, for the matching id — not on every render where `initialItems` happens to still be non-null (the prop can be non-null for the component's whole lifetime; the guard must be "did we already consume it," not "is it non-null"):

```typescript
  // initialItems は SSR が渡した「マウント時点の effectiveGroupId に対する
  // 最新値」。同じ id に対する初回 fetch effect を一度だけスキップするための
  // ガード。effectiveGroupId が変わったら（switchGroup 等）通常通り fetch する。
  const consumedInitialItemsRef = useRef(false);
```

Update the main fetch effect's guard (find the existing `useEffect` starting with `if (!accessToken || !effectiveGroupId) return;`):

```typescript
    if (!accessToken || !effectiveGroupId) return;

    if (
      !consumedInitialItemsRef.current &&
      initialItems !== null &&
      effectiveGroupId
    ) {
      consumedInitialItemsRef.current = true;
      return;
    }
```

Place this new block immediately after the existing `if (!accessToken || !effectiveGroupId) return;` line, before the rest of the effect body (the `speculativeFailureRef` reset logic etc.). Add `initialItems` to the effect's dependency array only if the linter requires it for the values actually read in the body — since `initialItems` is read only for the one-time-skip check and its identity shouldn't retrigger the effect on every render, follow the same `biome-ignore` pattern already used for `retryTick` on this effect if `initialItems` triggers a similar false-positive; if Biome does not flag it (because it's a prop, not local reactive state, and its reference is stable across the component's lifetime in practice), no `biome-ignore` addition is needed — verify by running `npx tsc --noEmit` and the project's lint step (`cd frontend && npx biome check src/app/stock-items/useStockItems.ts`) after this edit.

- [ ] **Step 3: Update the comment at `useStockItems.ts:59-66` per D4**

Find the existing comment block (starts with `// 書き込み系ハンドラ（handleCreate / handleSave / handleToggleWantToBuy /`). Replace every mention of the concept "未確定の推測値" with wording that also covers `initialGroupId`:

```typescript
  // 書き込み系ハンドラ（handleCreate / handleSave / handleToggleWantToBuy /
  // handleConfirmDelete / handleImageSelect / handleRenameGroup）は全て
  // effectiveGroupId（groupsのconfirmed値、または未確定のフォールバック値
  // ——AuthContext の initialGroupId。SSRのcookieまたはlocalStorage由来）を
  // 使う。これが安全なのは現状
  // frontend/src/app/stock-items/StockItemsClient.tsx（110行目付近）が
  // group 未確定の間スケルトンを表示し操作可能な UI を一切レンダーしないため
  // （ただし initialItems が非nullの場合はスケルトンをスキップする——Issue
  // #182。この場合も items 一覧は表示されるが、書き込み系UIそのものは
  // AuthGuard の children ゲート後に描画される点は変わらず、group が未確定な
  // 間は StockItemsClient 側の isGroupConfirmed ガードが書き込みハンドラの
  // 到達を引き続き防ぐ）、未確定 id で書き込みハンドラが呼ばれること自体が
  // 起こり得ないから。StockItemsClient がそのゲートを外す/変更する場合は、
  // この前提が崩れないかここを再確認すること。
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/app/stock-items/useStockItems.test.ts`
Expected: PASS (all tests, including every pre-existing race-guard test — confirm the speculative-failure/retry tests are unaffected since `initialItems: null` in all pre-existing call sites preserves old behavior exactly).

Run: `cd frontend && npx tsc --noEmit`
Expected: FAIL at this point — `StockItemsClient.tsx`'s call site doesn't pass the 5th argument yet. This is expected; Task 7 fixes it. Proceed to commit anyway (mid-plan states are allowed per this plan's dependency order), but do not consider this task's CI green until Task 7 lands. If gating per-task in subagent-driven-development, merge review of Tasks 6+7 together.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/stock-items/useStockItems.ts frontend/src/app/stock-items/useStockItems.test.ts
git commit -m "feat(stock-items): useStockItems accepts SSR-provided initialItems"
git push
```

---

## Task 7: StockItemsClient — thread `initialItems` through, fix skeleton gate

**Files:**
- Modify: `frontend/src/app/stock-items/StockItemsClient.tsx`
- Create: `frontend/src/app/stock-items/StockItemsClient.test.tsx` (moved content from `page.test.tsx`, see Step 1)
- Modify: `frontend/src/app/stock-items/page.test.tsx` (trimmed down — most of it moves out; final shape defined in Task 8)

**Interfaces:**
- Consumes: `initialItems: StockItem[] | null` prop.
- Produces: `<StockItemsClient initialItems={...} />` — consumed by Task 8 (`page.tsx`).

- [ ] **Step 1: Move existing behavioral tests from `page.test.tsx` to a new `StockItemsClient.test.tsx`**

`page.test.tsx` currently imports and renders `StockItemsPage` (not `StockItemsClient`) but exercises `StockItemsClient`'s actual behavior (loading state, item display, sign-out, modals) because today `page.tsx` is a trivial pass-through. Copy the **entire current content** of `frontend/src/app/stock-items/page.test.tsx` into a new file `frontend/src/app/stock-items/StockItemsClient.test.tsx`, then in the new file:
- Change `import StockItemsPage from "@/app/stock-items/page";` to `import StockItemsClient from "@/app/stock-items/StockItemsClient";`.
- Change every `render(<StockItemsPage />)` to `render(<StockItemsClient initialItems={null} />)` (the existing tests all mock `fetchStockItems` directly and expect a client-side fetch to happen — passing `initialItems={null}` preserves that exact existing behavior unchanged).
- Change every `describe("StockItemsPage", ...)` to `describe("StockItemsClient", ...)`.
- In the `vi.mock("@/contexts/AuthContext", ...)` mock object, rename `speculativeGroupId: "group-1",` to `initialGroupId: "group-1",` and add `initialAuthenticated: false,`.
- Remove the `vi.mock("@/components/AuthGuard", ...)` block if `StockItemsClient.tsx` still renders `<AuthGuard>` internally and the mock is still needed to bypass it in tests — keep this mock as-is (it's testing `StockItemsClient` in isolation, which still wraps its content in `<AuthGuard>`, so the mock remains necessary and correct).

Do not delete `page.test.tsx` yet — Task 8 replaces its content entirely with new, much smaller tests for the Server Component's own logic.

- [ ] **Step 2: Run the moved tests to verify they still pass unchanged (sanity check, not RED/GREEN — this is a pure move)**

Run: `cd frontend && npx vitest run src/app/stock-items/StockItemsClient.test.tsx`
Expected: FAIL — `StockItemsClient` doesn't accept an `initialItems` prop yet (TypeScript error) and `useStockItems`'s new 5th parameter isn't being passed from `StockItemsClient` yet (Task 6 changed the hook's signature; `StockItemsClient` still calls it with 4 args).

- [ ] **Step 3: Add new tests for the `initialItems` behavior**

Append to `frontend/src/app/stock-items/StockItemsClient.test.tsx`:

```typescript
  it("initialItems が渡されるとフェッチせずスケルトンをスキップし即座に一覧を表示する", async () => {
    const { fetchStockItems } = await import("@/lib/api");
    const initialItems = [
      {
        id: "1",
        name: "SSR商品",
        category: "調味料",
        imageUrl: null,
        sourceUrl: null,
        wantToBuy: false,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        sortedAt: "2026-01-01T00:00:00Z",
      },
    ];

    render(<StockItemsClient initialItems={initialItems} />);

    expect(screen.getByText("SSR商品")).toBeInTheDocument();
    expect(fetchStockItems).not.toHaveBeenCalled();
  });

  it("initialItems が null のとき従来通りスケルトンを表示してからフェッチする", async () => {
    const { fetchStockItems } = await import("@/lib/api");
    vi.mocked(fetchStockItems).mockReturnValue(new Promise(() => {}));

    render(<StockItemsClient initialItems={null} />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
```

Run: `cd frontend && npx vitest run src/app/stock-items/StockItemsClient.test.tsx`
Expected: FAIL (same reasons as Step 2, plus these two new tests).

- [ ] **Step 4: Implement in `StockItemsClient.tsx`**

Change the component signature (currently `export default function StockItemsClient() {`):

```typescript
import type { StockItem } from "@/types/stockItem";

export default function StockItemsClient({
  initialItems,
}: {
  initialItems: StockItem[] | null;
}) {
```

Update the `useAuth()` destructure: rename `speculativeGroupId` to `initialGroupId` (used a few lines below in `effectiveGroupId`), and update `effectiveGroupId`'s computation:

```typescript
  const {
    session,
    group,
    groups,
    switchGroup,
    signOut,
    loading: authLoading,
    refreshGroup,
    initialGroupId,
  } = useAuth();
  const accessToken = session?.access_token;
  const activeGroupId = group?.groupId;
  const effectiveGroupId = group?.groupId ?? initialGroupId;
  const isGroupConfirmed = group != null;
```

Update the `useStockItems(...)` call site to pass the new 5th argument:

```typescript
  } = useStockItems(
    accessToken,
    effectiveGroupId,
    refreshGroup,
    isGroupConfirmed,
    initialItems,
  );
```

Update the skeleton gate (D5 fix — currently `if (authLoading) return <StockItemsSkeleton />;`):

```typescript
  if (authLoading && initialItems === null) return <StockItemsSkeleton />;
```

- [ ] **Step 5: Update `page.tsx`'s current call site to pass `initialItems={null}` (temporary — Task 8 replaces this with the real SSR value)**

`frontend/src/app/stock-items/page.tsx` currently renders `<StockItemsClient />` with no props. Change to `<StockItemsClient initialItems={null} />` so the app still typechecks and behaves identically to today until Task 8 lands.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/app/stock-items/StockItemsClient.test.tsx`
Expected: PASS (all tests, moved + new).

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/stock-items/StockItemsClient.tsx frontend/src/app/stock-items/StockItemsClient.test.tsx frontend/src/app/stock-items/page.tsx
git commit -m "feat(stock-items): StockItemsClient accepts initialItems, skip skeleton when present"
git push
```

---

## Task 8: page.tsx — Server Component data fetch

**Files:**
- Create: `frontend/src/app/stock-items/getInitialStockItems.ts`
- Create: `frontend/src/app/stock-items/getInitialStockItems.test.ts`
- Modify: `frontend/src/app/stock-items/page.tsx`
- Rewrite: `frontend/src/app/stock-items/page.test.tsx` (replace entirely — its old content already moved to `StockItemsClient.test.tsx` in Task 7)

**Interfaces:**
- Produces: `getInitialStockItems(): Promise<StockItem[] | null>` — consumed by `page.tsx`.

- [ ] **Step 1: Write the failing tests for `getInitialStockItems`**

```typescript
// frontend/src/app/stock-items/getInitialStockItems.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStockItems } from "@/lib/api";

const mockCookiesGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: mockCookiesGet }),
}));

const mockGetSession = vi.fn();
vi.mock("@/lib/supabaseServerClient", () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: { getSession: mockGetSession },
  })),
}));

vi.mock("@/lib/api", () => ({ fetchStockItems: vi.fn() }));

describe("getInitialStockItems", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("cookie未設定のとき null を返し、fetchStockItems を呼ばない", async () => {
    mockCookiesGet.mockReturnValue(undefined);
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok" } },
    });
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
    expect(fetchStockItems).not.toHaveBeenCalled();
  });

  it("セッションが取得できないとき null を返す", async () => {
    mockCookiesGet.mockImplementation((name: string) =>
      name === "pantry-panel-active-group" ? { value: "group-1" } : undefined,
    );
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
    expect(fetchStockItems).not.toHaveBeenCalled();
  });

  it("cookieとセッションが揃っているとき fetchStockItems の結果を返す", async () => {
    mockCookiesGet.mockImplementation((name: string) =>
      name === "pantry-panel-active-group" ? { value: "group-1" } : undefined,
    );
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok" } },
    });
    const items = [
      {
        id: "1",
        name: "商品A",
        category: "調味料",
        imageUrl: null,
        sourceUrl: null,
        wantToBuy: false,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        sortedAt: "2026-01-01T00:00:00Z",
      },
    ];
    vi.mocked(fetchStockItems).mockResolvedValue(items);
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toEqual(items);
    expect(fetchStockItems).toHaveBeenCalledWith("tok", "group-1");
  });

  it("fetchStockItems が失敗したら null を返す（エラーを投げない）", async () => {
    mockCookiesGet.mockImplementation((name: string) =>
      name === "pantry-panel-active-group" ? { value: "group-1" } : undefined,
    );
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok" } },
    });
    vi.mocked(fetchStockItems).mockRejectedValue(new Error("HTTP 500"));
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
  });

  it("Supabase env未設定（createSupabaseServerClientがnullを返す）のとき null を返す", async () => {
    const { createSupabaseServerClient } = await import(
      "@/lib/supabaseServerClient"
    );
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce(
      null as never,
    );
    mockCookiesGet.mockImplementation((name: string) =>
      name === "pantry-panel-active-group" ? { value: "group-1" } : undefined,
    );
    const { getInitialStockItems } = await import("./getInitialStockItems");

    const result = await getInitialStockItems();

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/app/stock-items/getInitialStockItems.test.ts`
Expected: FAIL with "Cannot find module './getInitialStockItems'".

- [ ] **Step 3: Write the implementation**

```typescript
// frontend/src/app/stock-items/getInitialStockItems.ts
import { cookies } from "next/headers";
import { ACTIVE_GROUP_COOKIE_NAME } from "@/lib/activeGroupCookie";
import { fetchStockItems } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import type { StockItem } from "@/types/stockItem";

// stock-items ページの Server Component から呼ばれる（Issue #182）。cookie に
// 保存されたアクティブグループIDがあれば、Go API から商品一覧を取得して SSR
// HTML に埋め込む。cookie未設定・セッション未確認・API失敗のいずれの場合も
// null を返す（best-effort。クライアント側の useStockItems が通常の
// fetchフローにフォールバックするため、ここでは例外を投げない）。
export async function getInitialStockItems(): Promise<StockItem[] | null> {
  const cookieStore = await cookies();
  const activeGroupId = cookieStore.get(ACTIVE_GROUP_COOKIE_NAME)?.value;
  if (!activeGroupId) return null;

  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    // Server Component では cookie を書き換えられない（Server
    // Action/Route Handler/middleware 専用の API）。ここはセッションの
    // 読み取りのみが目的で、リフレッシュ結果の書き戻しは不要
    // （middleware が既にリフレッシュ・書き戻しを行っている）ため no-op。
    setAll: () => {},
  });
  if (!supabase) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  try {
    return await fetchStockItems(session.access_token, activeGroupId);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/app/stock-items/getInitialStockItems.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Convert `page.tsx` to an async Server Component**

Current `frontend/src/app/stock-items/page.tsx`:

```typescript
import { Suspense } from "react";
import StockItemsClient from "./StockItemsClient";
import StockItemsSkeleton from "./StockItemsSkeleton";

export default function StockItemsPage() {
  return (
    <Suspense fallback={<StockItemsSkeleton />}>
      <StockItemsClient />
    </Suspense>
  );
}
```

Change to:

```typescript
import { Suspense } from "react";
import { getInitialStockItems } from "./getInitialStockItems";
import StockItemsClient from "./StockItemsClient";
import StockItemsSkeleton from "./StockItemsSkeleton";

export default async function StockItemsPage() {
  const initialItems = await getInitialStockItems();
  return (
    <Suspense fallback={<StockItemsSkeleton />}>
      <StockItemsClient initialItems={initialItems} />
    </Suspense>
  );
}
```

- [ ] **Step 6: Rewrite `page.test.tsx`**

Its old content already moved to `StockItemsClient.test.tsx` in Task 7. Replace the entire file with:

```typescript
// frontend/src/app/stock-items/page.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getInitialStockItems } from "./getInitialStockItems";
import StockItemsPage from "./page";

vi.mock("./getInitialStockItems", () => ({
  getInitialStockItems: vi.fn(),
}));
vi.mock("./StockItemsClient", () => ({
  default: ({ initialItems }: { initialItems: unknown }) => (
    <span>initialItems:{JSON.stringify(initialItems)}</span>
  ),
}));

describe("StockItemsPage (Server Component)", () => {
  it("getInitialStockItems の結果を StockItemsClient に initialItems として渡す", async () => {
    vi.mocked(getInitialStockItems).mockResolvedValue([
      {
        id: "1",
        name: "商品A",
        category: "調味料",
        imageUrl: null,
        sourceUrl: null,
        wantToBuy: false,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        sortedAt: "2026-01-01T00:00:00Z",
      },
    ]);

    const element = await StockItemsPage();
    render(element);

    expect(screen.getByText(/"name":"商品A"/)).toBeInTheDocument();
  });

  it("getInitialStockItems が null を返したとき StockItemsClient に null を渡す", async () => {
    vi.mocked(getInitialStockItems).mockResolvedValue(null);

    const element = await StockItemsPage();
    render(element);

    expect(screen.getByText("initialItems:null")).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/app/stock-items/page.test.tsx`
Expected: PASS (2 tests).

Run: `cd frontend && npx vitest run` (full suite)
Expected: PASS — 0 regressions across every test file touched by this plan so far (Tasks 1–8).

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

Run: `cd frontend && npx biome check src`
Expected: PASS (fix any lint findings inline before proceeding).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/stock-items/getInitialStockItems.ts frontend/src/app/stock-items/getInitialStockItems.test.ts frontend/src/app/stock-items/page.tsx frontend/src/app/stock-items/page.test.tsx
git commit -m "feat(stock-items): make page.tsx an async Server Component with SSR items"
git push
```

---

## Task 9: E2E — assert items in the initial HTML response

**Files:**
- Modify: `frontend/e2e/global-setup.ts`
- Create: `frontend/e2e/ssr-stock-items.spec.ts`

**Interfaces:**
- None (end of the dependency chain — exercises the full stack built in Tasks 1–8).

- [ ] **Step 1: Seed the active-group cookie in `global-setup.ts`**

`global-setup.ts` currently seeds `storageState.origins[0].localStorage` with `pantry-panel:active-group-id` but not the new cookie. Without it, the authenticated E2E storageState would hit the "cookie未設定" branch (`initialItems: null`) even for otherwise-authenticated runs, defeating this task's purpose. Add a cookie entry to the `chunks.map(...)` array (find the existing `storageState.cookies` construction) — add a **new**, separate cookie entry (not a session-auth chunk) right after computing `chunks`:

```typescript
  const storageState = {
    cookies: [
      ...chunks.map((chunk) => ({
        name: chunk.name,
        value: chunk.value,
        domain: originUrl.hostname,
        path: "/",
        expires,
        httpOnly: false,
        secure,
        sameSite: "Lax" as const,
      })),
      {
        name: "pantry-panel-active-group",
        value: testGroupId,
        domain: originUrl.hostname,
        path: "/",
        expires,
        httpOnly: false,
        secure,
        sameSite: "Lax" as const,
      },
    ],
    origins: [
      {
        origin,
        localStorage: [
          { name: "pantry-panel:active-group-id", value: testGroupId },
        ],
      },
    ],
  };
```

- [ ] **Step 2: Write the new E2E spec**

```typescript
// frontend/e2e/ssr-stock-items.spec.ts
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

// Issue #182: middleware→layout→AuthContext→AuthGuard→useStockItems→page.tsx
// の SSR 連鎖全体が正しく繋がっているかを検証する唯一のテスト。ここが無いと、
// 実装がクライアントフェッチに静かにフォールバックし続けていても、既存の
// E2E は最終描画状態への自動待機（toBeVisible 等）で書かれているため誰も
// 気づけない（testing.md 2026-09-04 の networkidle proxy の教訓と同種の穴）。

async function seedItem(itemName: string): Promise<{ cleanup: () => Promise<void> }> {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY;
  const testEmail = process.env.E2E_TEST_EMAIL;
  const testPassword = process.env.E2E_TEST_PASSWORD;
  const backendUrl = process.env.PREVIEW_BACKEND_URL || "http://localhost:8080";

  const groupFile = path.join(process.cwd(), ".auth", "group.json");
  const { id: groupId } = JSON.parse(
    fs.readFileSync(groupFile, "utf8"),
  ) as { id: string };

  if (!supabaseUrl || !supabaseAnonKey || !testEmail || !testPassword) {
    throw new Error("E2E env vars not set");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (error || !data.session) {
    throw new Error(`sign-in failed: ${error?.message}`);
  }

  const headers = {
    Authorization: `Bearer ${data.session.access_token}`,
    "X-Active-Group-ID": groupId,
    "Content-Type": "application/json",
  };

  const createResp = await fetch(`${backendUrl}/api/stock-items`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: itemName, category: "調味料", wantToBuy: false }),
  });
  if (!createResp.ok) {
    throw new Error(`seed item failed: ${createResp.status}`);
  }
  const created = (await createResp.json()) as { id: string };

  return {
    cleanup: async () => {
      await fetch(`${backendUrl}/api/stock-items/${created.id}`, {
        method: "DELETE",
        headers,
      });
    },
  };
}

test.describe("SSR stock-items (Issue #182)", () => {
  test("cookie設定済み・有効なgroupIdのとき、JS実行前の初期HTMLに商品名が含まれる", async ({
    browser,
  }) => {
    const itemName = `SSR確認用商品-${Date.now()}`;
    const { cleanup } = await seedItem(itemName);

    try {
      // storageState はデフォルトプロジェクトの認証済み状態
      // (.auth/user.json、global-setup.ts で cookie/localStorage 両方に
      // active group が書き込み済み) をそのまま引き継ぐ。JS を無効化して
      // hydration前のSSR HTMLだけを見る。
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();

      await page.goto("/stock-items");

      await expect(page.getByText(itemName)).toBeVisible();

      await context.close();
    } finally {
      await cleanup();
    }
  });
});
```

- [ ] **Step 3: Run the new E2E spec locally against mock project**

Run: `cd frontend && npx playwright test ssr-stock-items.spec.ts --project=mock`
Expected: this spec requires a real authenticated Supabase session and a real backend — check `playwright.config.ts` for whether `mock` project supports this (it likely does not, since `seedItem` calls the real Supabase/Go API). If `mock` project isn't suitable, run instead: `cd frontend && npx playwright test ssr-stock-items.spec.ts --project=preview` (requires `PREVIEW_URL`/`PREVIEW_BACKEND_URL`/E2E env vars set — same requirements as `realtime-sync.spec.ts`). Confirm locally with whichever project this repo's `playwright.config.ts` designates for tests requiring real backend + real Supabase auth (check how `realtime-sync.spec.ts` is run in CI, in `.github/workflows/e2e.yml` or similar, and mirror that project assignment for this new spec).
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/global-setup.ts frontend/e2e/ssr-stock-items.spec.ts
git commit -m "test(e2e): assert stock-items renders in the SSR HTML before JS runs"
git push
```

---

## Task 10: Full verification, testing.md update, spec sync

**Files:**
- Modify: `.claude/rules/testing.md` (if any deviation from the design doc's testing plan was found during implementation — see below)
- No other file changes expected; this task is verification + documentation, not code.

- [ ] **Step 1: Run the full frontend unit suite**

Run: `cd frontend && npx vitest run`
Expected: PASS, 0 failures, across every file (confirms Tasks 1–8 didn't regress anything outside their own touched files — in particular, re-check `frontend/src/app/stock-items/startupFetch.integration.test.tsx`, which exercises the parallel-fetch guarantee from Issue #236 and may reference `speculativeGroupId` — rename any remaining references there too if found).

- [ ] **Step 2: Run typecheck and lint**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

Run: `cd frontend && npx biome check src e2e`
Expected: PASS.

- [ ] **Step 3: Run the full local E2E suite (mock project)**

Run: `cd frontend && npx playwright test --project=mock` (with `npm run dev` running in another terminal per `general.md`'s local-E2E convention)
Expected: PASS, 0 failures. Pay particular attention to `auth.spec.ts`'s S-5 (group-empty → `/no-group`) and S-6 (session persists across reload/navigation) scenarios, and `stock-items.spec.ts` — these were flagged in the design doc as "likely unaffected"; if any fail, that is new information the design doc's Testing Plan section got wrong, and must be corrected in `docs/superpowers/specs/2026-09-11-stock-items-server-component-design.md` (append a note under "既存E2Eへの影響（調査済み）") before proceeding, not silently patched around.

- [ ] **Step 4: Update `.claude/rules/testing.md`'s judgment log, if warranted**

Only if Step 3 surfaced a genuinely new, generalizable testing lesson (per the existing log's format — see the file's own historical entries for the template). If nothing new was learned beyond what Tasks 1–9 already anticipated, skip this step — do not manufacture a log entry for its own sake.

- [ ] **Step 5: Verify no stray `speculativeGroupId` references remain**

Run: `cd frontend && grep -rn "speculativeGroupId" src e2e`
Expected: no output (all renamed to `initialGroupId` across Tasks 4, 5, 7, and any test files touched in Step 1's regression check).

- [ ] **Step 6: Commit (only if Step 4 produced changes)**

```bash
git add .claude/rules/testing.md
git commit -m "docs(testing): record findings from stock-items SSR E2E verification"
git push
```

---

## Post-plan (not part of this plan's tasks — handled by the calling workflow)

- Code review sub-agent pass over the full diff.
- `gh pr checks --watch` on PR #272.
- `opsx:archive`-equivalent: sync D1–D6 into any relevant `openspec/specs/` capability if one exists for stock-items/auth (check `openspec/specs/ssr-session-auth/spec.md` and `openspec/specs/auth-guard/spec.md` — both were touched by prior related work in this session and may need MODIFIED Requirements entries for the `initialAuthenticated`/`initialGroupId` gate change, mirroring how Issues #260/#261 updated them).
- Move the design doc's D1–D6 "この訂正で4状態を確認" table findings into `openspec/specs/auth-guard/spec.md` if that capability's spec should reflect the new gate condition as a first-class requirement (judgment call for the reviewing session — this plan does not decide it).
