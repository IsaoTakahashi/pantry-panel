import { act, render, screen, waitFor } from "@testing-library/react";
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
});
