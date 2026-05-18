import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  fetchMyGroup: vi.fn(),
}));

import { fetchMyGroup } from "@/lib/authApi";
import { getSupabaseClient } from "@/lib/supabaseClient";

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
