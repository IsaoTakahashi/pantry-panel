import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AuthGuard from "./AuthGuard";

vi.mock("@/contexts/AuthContext");
vi.mock("@/lib/supabaseClient");
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient } from "@/lib/supabaseClient";

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
    render(
      <AuthGuard>
        <span>content</span>
      </AuthGuard>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("loading=true のとき children を表示しない", () => {
    vi.mocked(getSupabaseClient).mockReturnValue({} as never);
    setup({ loading: true });
    render(
      <AuthGuard>
        <span>content</span>
      </AuthGuard>,
    );
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("未認証のとき /login へリダイレクトする", () => {
    vi.mocked(getSupabaseClient).mockReturnValue({} as never);
    setup({ session: null });
    render(
      <AuthGuard>
        <span>content</span>
      </AuthGuard>,
    );
    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("認証済み・グループ未所属のとき /no-group へリダイレクトする", () => {
    vi.mocked(getSupabaseClient).mockReturnValue({} as never);
    setup({ session: { access_token: "tok" } as never, group: null });
    render(
      <AuthGuard>
        <span>content</span>
      </AuthGuard>,
    );
    expect(mockPush).toHaveBeenCalledWith("/no-group");
  });

  it("認証済み・グループ所属のとき children を表示する", () => {
    vi.mocked(getSupabaseClient).mockReturnValue({} as never);
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
