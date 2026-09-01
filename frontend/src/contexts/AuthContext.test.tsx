import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupInfo } from "@/types/group";
import { AuthProvider, useAuth } from "./AuthContext";

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
  fetchMyGroups: vi.fn(),
}));

import { fetchMyGroups } from "@/lib/authApi";
import { getSupabaseClient } from "@/lib/supabaseClient";

function TestConsumer() {
  const { session, group, groups, loading, switchGroup } = useAuth();
  if (loading) return <span>loading</span>;
  return (
    <span>
      {session ? "authenticated" : "anonymous"}
      {group ? `:${group.name}` : ":no-group"}
      {groups.length > 1 && (
        <button type="button" onClick={() => switchGroup(groups[1].groupId)}>
          switch
        </button>
      )}
    </span>
  );
}

type AuthContextHandle = { refreshGroup: () => Promise<void> };

function RefreshCapture({
  onReady,
}: {
  onReady: (handle: AuthContextHandle) => void;
}) {
  const { refreshGroup } = useAuth();
  onReady({ refreshGroup });
  return null;
}

type SpeculativeCaptureHandle = {
  speculativeGroupId: string | undefined;
  groups: GroupInfo[];
  signOut: () => Promise<void>;
  switchGroup: (groupId: string) => void;
};

function SpeculativeCapture({
  onReady,
}: {
  onReady: (handle: SpeculativeCaptureHandle) => void;
}) {
  const { speculativeGroupId, groups, signOut, switchGroup } = useAuth();
  onReady({ speculativeGroupId, groups, signOut, switchGroup });
  return null;
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
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
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
    vi.mocked(fetchMyGroups).mockResolvedValue([
      { groupId: "g1", name: "我が家", role: "owner" },
    ]);
    renderWithAuth();
    await waitFor(() =>
      expect(screen.getByText("authenticated:我が家")).toBeInTheDocument(),
    );
    expect(fetchMyGroups).toHaveBeenCalledWith("tok");
  });

  it("グループ未所属のとき no-group を表示する", async () => {
    const session = { access_token: "tok", user: { id: "u1" } };
    mockGetSession.mockResolvedValue({ data: { session } });
    vi.mocked(fetchMyGroups).mockResolvedValue([]);
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
    vi.mocked(fetchMyGroups).mockResolvedValue([
      { groupId: "g1", name: "我が家", role: "member" },
    ]);

    renderWithAuth();
    await waitFor(() =>
      expect(screen.getByText("anonymous:no-group")).toBeInTheDocument(),
    );

    // SIGNED_IN イベントをシミュレート
    act(() => {
      stateCallback("SIGNED_IN", { access_token: "tok2", user: { id: "u1" } });
    });

    await waitFor(() =>
      expect(screen.getByText("authenticated:我が家")).toBeInTheDocument(),
    );
  });

  it("switchGroup updates active group and saves to localStorage", async () => {
    const session = { access_token: "tok", user: { id: "u1" } };
    mockGetSession.mockResolvedValue({ data: { session } });
    vi.mocked(fetchMyGroups).mockResolvedValue([
      { groupId: "g1", name: "我が家", role: "owner" },
      { groupId: "g2", name: "実家", role: "member" },
    ]);

    renderWithAuth();
    await waitFor(() =>
      expect(screen.getByText("authenticated:我が家")).toBeInTheDocument(),
    );

    act(() => {
      screen.getByRole("button", { name: "switch" }).click();
    });

    await waitFor(() =>
      expect(screen.getByText("authenticated:実家")).toBeInTheDocument(),
    );

    expect(localStorage.getItem("pantry-panel:active-group-id")).toBe("g2");
  });

  it("初期ロードで getSession と INITIAL_SESSION が同じトークンを返しても groups 取得は 1 回だけ", async () => {
    const session = { access_token: "tok", user: { id: "u1" } };
    mockGetSession.mockResolvedValue({ data: { session } });
    let stateCallback: (event: string, session: unknown) => void = () => {};
    mockOnAuthStateChange.mockImplementation((cb) => {
      stateCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    vi.mocked(fetchMyGroups).mockResolvedValue([
      { groupId: "g1", name: "我が家", role: "owner" },
    ]);

    renderWithAuth();
    await waitFor(() =>
      expect(screen.getByText("authenticated:我が家")).toBeInTheDocument(),
    );

    // onAuthStateChange が起動時に発する一連のイベント（INITIAL_SESSION →
    // SIGNED_IN → TOKEN_REFRESHED）は同じトークンを運ぶ。getSession 経路と
    // 合わせても fetchMyGroups は 1 回だけであるべき。
    act(() => {
      stateCallback("INITIAL_SESSION", session);
      stateCallback("SIGNED_IN", session);
      stateCallback("TOKEN_REFRESHED", session);
    });

    await waitFor(() =>
      expect(screen.getByText("authenticated:我が家")).toBeInTheDocument(),
    );
    expect(fetchMyGroups).toHaveBeenCalledTimes(1);
  });

  it("Supabase 未設定でも loading=false になる", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    renderWithAuth();
    // loading フォールバックが消えて中身が描画されること
    await waitFor(() =>
      expect(screen.queryByText("loading")).not.toBeInTheDocument(),
    );
    expect(fetchMyGroups).not.toHaveBeenCalled();
  });

  it("refreshGroup は同じトークンでも groups を再取得する", async () => {
    const session = { access_token: "tok", user: { id: "u1" } };
    mockGetSession.mockResolvedValue({ data: { session } });
    vi.mocked(fetchMyGroups).mockResolvedValue([
      { groupId: "g1", name: "我が家", role: "owner" },
    ]);

    let captured: AuthContextHandle | null = null;
    render(
      <AuthProvider>
        <RefreshCapture onReady={(h) => (captured = h)} />
      </AuthProvider>,
    );

    await waitFor(() => expect(fetchMyGroups).toHaveBeenCalledTimes(1));

    await act(async () => {
      await captured?.refreshGroup();
    });

    // dedup ガードがあっても refreshGroup は強制再取得する
    expect(fetchMyGroups).toHaveBeenCalledTimes(2);
  });

  it("起動時、永続セッション復元中は groups 解決まで loading=true を維持する（早期 no-group 取りこぼし防止）", async () => {
    // getSession は永続セッションを返す（null ではない）。これが本リグレッションの肝。
    const session = { access_token: "tok", user: { id: "u1" } };
    mockGetSession.mockResolvedValue({ data: { session } });

    // fetchMyGroups を手動制御の deferred にして、解決前に loading を観測する。
    let resolveGroups: (gs: GroupInfo[]) => void = () => {};
    vi.mocked(fetchMyGroups).mockReturnValue(
      new Promise<GroupInfo[]>((resolve) => {
        resolveGroups = resolve;
      }),
    );

    let stateCallback: (event: string, session: unknown) => void = () => {};
    mockOnAuthStateChange.mockImplementation((cb) => {
      stateCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    renderWithAuth();

    // getSession が解決し loadGroups が起動するのを待つ。
    await waitFor(() => expect(fetchMyGroups).toHaveBeenCalledTimes(1));

    // INITIAL_SESSION が fetch 進行中に発火（同一トークン → dedup される）。
    // 修正前はここで onAuthStateChange の無条件 setLoading(false) が走り、
    // group=null のまま loading が false になって AuthGuard が誤って /no-group へ飛ばす。
    act(() => {
      stateCallback("INITIAL_SESSION", session);
    });

    // groups 未解決の間は loading=true を維持していること（= no-group 表示を出さない）。
    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(
      screen.queryByText("authenticated:no-group"),
    ).not.toBeInTheDocument();

    // groups が解決したら通常通り表示される。
    await act(async () => {
      resolveGroups([{ groupId: "g1", name: "我が家", role: "owner" }]);
    });
    await waitFor(() =>
      expect(screen.getByText("authenticated:我が家")).toBeInTheDocument(),
    );
    expect(fetchMyGroups).toHaveBeenCalledTimes(1);
  });

  it("localStorage に保存された active group id を復元する", async () => {
    localStorage.setItem("pantry-panel:active-group-id", "g2");
    const session = { access_token: "tok", user: { id: "u1" } };
    mockGetSession.mockResolvedValue({ data: { session } });
    vi.mocked(fetchMyGroups).mockResolvedValue([
      { groupId: "g1", name: "我が家", role: "owner" },
      { groupId: "g2", name: "実家", role: "member" },
    ]);

    renderWithAuth();
    await waitFor(() =>
      expect(screen.getByText("authenticated:実家")).toBeInTheDocument(),
    );
  });

  it("mount 時に localStorage の active group id を speculativeGroupId として同期的に公開する", () => {
    localStorage.setItem("pantry-panel:active-group-id", "cached-g1");
    vi.mocked(getSupabaseClient).mockReturnValue(null);

    // 最新値だけを上書きする `let captured` だと、useEffect 実装でも act() 内で
    // 効果が解決済みになり最終値が一致してしまい退行を検出できない。
    // すべての onReady 呼び出しを記録し、FIRST render の値を検証することで
    // 「初回レンダーで既に値がある」＝lazy initializer であることを保証する。
    const calls: SpeculativeCaptureHandle[] = [];
    render(
      <AuthProvider>
        <SpeculativeCapture onReady={(h) => calls.push(h)} />
      </AuthProvider>,
    );

    // render() 直後（await/waitFor なし）で、かつ最初の呼び出し（calls[0]）が
    // 既に値を持っていることが lazy initializer 実装の根拠。
    // useEffect 実装なら calls[0].speculativeGroupId は undefined になるはず。
    expect(calls[0]?.speculativeGroupId).toBe("cached-g1");
  });

  it("signOut は speculativeGroupId を undefined にリセットする", async () => {
    localStorage.setItem("pantry-panel:active-group-id", "g1");
    const session = { access_token: "tok", user: { id: "u1" } };
    mockGetSession.mockResolvedValue({ data: { session } });
    vi.mocked(fetchMyGroups).mockResolvedValue([
      { groupId: "g1", name: "我が家", role: "owner" },
    ]);

    let captured: SpeculativeCaptureHandle | null = null;
    render(
      <AuthProvider>
        <SpeculativeCapture onReady={(h) => (captured = h)} />
      </AuthProvider>,
    );

    expect(
      (captured as SpeculativeCaptureHandle | null)?.speculativeGroupId,
    ).toBe("g1");
    await waitFor(() =>
      expect((captured as SpeculativeCaptureHandle | null)?.groups.length).toBe(
        1,
      ),
    );

    await act(async () => {
      await (captured as SpeculativeCaptureHandle | null)?.signOut();
    });

    expect(
      (captured as SpeculativeCaptureHandle | null)?.speculativeGroupId,
    ).toBeUndefined();
  });

  it("switchGroup は speculativeGroupId を新しい groupId に更新する", async () => {
    const session = { access_token: "tok", user: { id: "u1" } };
    mockGetSession.mockResolvedValue({ data: { session } });
    vi.mocked(fetchMyGroups).mockResolvedValue([
      { groupId: "g1", name: "我が家", role: "owner" },
      { groupId: "g2", name: "実家", role: "member" },
    ]);

    let captured: SpeculativeCaptureHandle | null = null;
    render(
      <AuthProvider>
        <SpeculativeCapture onReady={(h) => (captured = h)} />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect((captured as SpeculativeCaptureHandle | null)?.groups.length).toBe(
        2,
      ),
    );
    // applyGroups は確定した active group と speculativeGroupId を同期させる
    // （Decision 5）。savedId が無いのでフォールバック先の gs[0]（"g1"）が
    // active になり、speculativeGroupId もそれに合わせて "g1" になる。
    expect(
      (captured as SpeculativeCaptureHandle | null)?.speculativeGroupId,
    ).toBe("g1");

    act(() => {
      (captured as SpeculativeCaptureHandle | null)?.switchGroup("g2");
    });

    await waitFor(() =>
      expect(
        (captured as SpeculativeCaptureHandle | null)?.speculativeGroupId,
      ).toBe("g2"),
    );
  });
});
