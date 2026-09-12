import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthGuard from "./AuthGuard";

vi.mock("@/contexts/AuthContext");
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

const mockPush = vi.fn();
const mockReplace = vi.fn();

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function setup(auth: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    session: null,
    user: null,
    groups: [],
    group: null,
    initialGroupId: undefined,
    initialAuthenticated: false,
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshGroup: vi.fn(),
    switchGroup: vi.fn(),
    ...auth,
  });
  vi.mocked(useRouter).mockReturnValue({
    push: mockPush,
    replace: mockReplace,
  } as never);
}

describe("AuthGuard", () => {
  it("Supabase 未設定のとき children をそのまま表示する（auth 無効モード）", () => {
    setup({});
    render(
      <AuthGuard>
        <span>content</span>
      </AuthGuard>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  describe("Supabase 有効時", () => {
    beforeEach(() => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    });

    it("session はあるが group も initialGroupId も無く loading=true のとき children を表示しない", () => {
      setup({
        session: { access_token: "tok" } as never,
        group: null,
        initialGroupId: undefined,
        loading: true,
      });
      render(
        <AuthGuard>
          <span>content</span>
        </AuthGuard>,
      );
      expect(screen.queryByText("content")).not.toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("session も group も無く loading=true のとき children を表示しない", () => {
      setup({ loading: true });
      render(
        <AuthGuard>
          <span>content</span>
        </AuthGuard>,
      );
      expect(screen.queryByText("content")).not.toBeInTheDocument();
      expect(screen.queryByText(/ログインが必要です/)).not.toBeInTheDocument();
    });

    it("session が無く loading=false のときフォールバックUIを表示し、リダイレクトしない", () => {
      setup({ session: null });
      render(
        <AuthGuard>
          <span>content</span>
        </AuthGuard>,
      );
      expect(screen.getByText(/ログインが必要です/)).toBeInTheDocument();
      const link = screen.getByRole("link", { name: "ログイン画面へ" });
      expect(link).toHaveAttribute("href", "/login");
      expect(screen.queryByText("content")).not.toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("意図的なサインアウト直後に一瞬表示されても文言が事実と矛盾しない（session===null && loading===false の描画で「セッションが切れました」を断定しない）", () => {
      setup({ session: null });
      render(
        <AuthGuard>
          <span>content</span>
        </AuthGuard>,
      );
      expect(
        screen.queryByText(/セッションが切れました/),
      ).not.toBeInTheDocument();
    });

    it("session と initialGroupId があれば group 未確定・loading=true でも children を表示する", () => {
      setup({
        session: { access_token: "tok" } as never,
        group: null,
        initialGroupId: "g1",
        loading: true,
      });
      render(
        <AuthGuard>
          <span>content</span>
        </AuthGuard>,
      );
      expect(screen.getByText("content")).toBeInTheDocument();
    });

    it("session と initialGroupId のみ（loading=true）ではリダイレクトが発生しない", () => {
      setup({
        session: { access_token: "tok" } as never,
        group: null,
        initialGroupId: "g1",
        loading: true,
      });
      render(
        <AuthGuard>
          <span>content</span>
        </AuthGuard>,
      );
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("session と確定 group があれば loading=true でも children を表示する", () => {
      setup({
        session: { access_token: "tok" } as never,
        group: { groupId: "g1", name: "家", role: "owner" },
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

    it("認証済み・グループ未所属のとき /no-group へリダイレクトする", () => {
      setup({ session: { access_token: "tok" } as never, group: null });
      render(
        <AuthGuard>
          <span>content</span>
        </AuthGuard>,
      );
      expect(mockPush).toHaveBeenCalledWith("/no-group");
    });

    it("loading=false で initialGroupId があっても group 未確定なら /no-group へリダイレクトする", () => {
      setup({
        session: { access_token: "tok" } as never,
        group: null,
        initialGroupId: "g1",
        loading: false,
      });
      render(
        <AuthGuard>
          <span>content</span>
        </AuthGuard>,
      );
      expect(mockPush).toHaveBeenCalledWith("/no-group");
    });

    it("認証済み・グループ所属のとき children を表示する", () => {
      setup({
        session: { access_token: "tok" } as never,
        group: { groupId: "g1", name: "家", role: "owner" },
      });
      render(
        <AuthGuard>
          <span>content</span>
        </AuthGuard>,
      );
      expect(screen.getByText("content")).toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });

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

    // Issue #261 の受動的セッション喪失フォールバックの回帰テスト。
    // initialAuthenticated / initialGroupId はサーバーが認証済みリクエストごとに
    // 渡す値で、クライアント側からクリアされることが無い（AuthContext は
    // initialAuthenticated を prop のまま context に流しており state ではない）。
    // そのため「initialAuthenticated が session の代わりを無条件に務める」ゲートだと、
    // クライアントが後から session===null を確定させた場合（別タブでのサインアウト、
    // トークン失効・失効済みトークン等。onAuthStateChange の null 分岐は
    // session=null, loading=false にするが initialGroupId は触らない）でも
    // ゲートが開いたままになり、このフォールバックUIへ到達できなくなる。
    // loading===false は「クライアントが確定的に解決し終えた」ことを意味するため、
    // その時点では実 session を要求する。
    it("initialAuthenticated/initialGroupId があってもクライアントが session===null を確定したら（loading=false）フォールバックUIを表示する", () => {
      setup({
        session: null,
        group: null,
        initialAuthenticated: true,
        initialGroupId: "ssr-group-1",
        loading: false,
      });
      render(
        <AuthGuard>
          <span>content</span>
        </AuthGuard>,
      );
      expect(screen.getByText(/ログインが必要です/)).toBeInTheDocument();
      const link = screen.getByRole("link", { name: "ログイン画面へ" });
      expect(link).toHaveAttribute("href", "/login");
      expect(screen.queryByText("content")).not.toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
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
  });
});
