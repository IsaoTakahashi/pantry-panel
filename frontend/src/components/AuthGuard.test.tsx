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
    speculativeGroupId: undefined,
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

    it("session はあるが group も speculativeGroupId も無く loading=true のとき children を表示しない", () => {
      setup({
        session: { access_token: "tok" } as never,
        group: null,
        speculativeGroupId: undefined,
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

    it("session と speculativeGroupId があれば group 未確定・loading=true でも children を表示する", () => {
      setup({
        session: { access_token: "tok" } as never,
        group: null,
        speculativeGroupId: "g1",
        loading: true,
      });
      render(
        <AuthGuard>
          <span>content</span>
        </AuthGuard>,
      );
      expect(screen.getByText("content")).toBeInTheDocument();
    });

    it("session と speculativeGroupId のみ（loading=true）ではリダイレクトが発生しない", () => {
      setup({
        session: { access_token: "tok" } as never,
        group: null,
        speculativeGroupId: "g1",
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

    it("loading=false で speculativeGroupId があっても group 未確定なら /no-group へリダイレクトする", () => {
      setup({
        session: { access_token: "tok" } as never,
        group: null,
        speculativeGroupId: "g1",
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
  });
});
