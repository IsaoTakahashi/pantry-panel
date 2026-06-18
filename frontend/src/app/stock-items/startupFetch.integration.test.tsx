import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import type { GroupInfo } from "@/types/group";
import { useStockItems } from "./useStockItems";

// Integration test: REAL AuthProvider + REAL useStockItems wired exactly like
// StockItemsClient. Reproduces the startup timing race where onAuthStateChange
// flips authLoading=false (INITIAL_SESSION) while groups are still in flight,
// causing useStockItems to fetch twice (once with activeGroupId === undefined).

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockClient = {
  auth: {
    getSession: mockGetSession,
    onAuthStateChange: mockOnAuthStateChange,
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
  },
};

vi.mock("@/lib/supabaseClient", () => ({
  getSupabaseClient: vi.fn(),
}));
vi.mock("@/lib/authApi");
vi.mock("@/lib/api");
vi.mock("@/lib/useStockItemsRealtime");

import { fetchStockItems } from "@/lib/api";
import { fetchMyGroups } from "@/lib/authApi";
import { getSupabaseClient } from "@/lib/supabaseClient";

// Mirrors StockItemsClient.tsx wiring.
function Harness() {
  const { session, group, loading, refreshGroup } = useAuth();
  useStockItems(session?.access_token, group?.groupId, refreshGroup, loading);
  return null;
}

beforeEach(() => {
  vi.mocked(getSupabaseClient).mockReturnValue(mockClient as never);
  vi.mocked(fetchStockItems).mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("startup stock-items fetch", () => {
  it("fetches stock-items exactly once and never with undefined group despite the auth-event/group timing race", async () => {
    const session = { access_token: "tok", user: { id: "u1" } };
    mockGetSession.mockResolvedValue({ data: { session } });

    // onAuthStateChange emits INITIAL_SESSION asynchronously after subscribe,
    // as the real Supabase client does.
    let stateCallback: (event: string, s: unknown) => void = () => {};
    mockOnAuthStateChange.mockImplementation((cb) => {
      stateCallback = cb;
      queueMicrotask(() => cb("INITIAL_SESSION", session));
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    // Controllable deferred so the group fetch is genuinely in flight while the
    // INITIAL_SESSION event fires (this is what exposes the race).
    let resolveGroups: (gs: GroupInfo[]) => void = () => {};
    vi.mocked(fetchMyGroups).mockReturnValue(
      new Promise<GroupInfo[]>((r) => {
        resolveGroups = r;
      }),
    );

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );

    // Let getSession + INITIAL_SESSION settle while groups are still pending.
    await act(async () => {
      await Promise.resolve();
    });

    // Now resolve groups — the active group becomes known.
    await act(async () => {
      resolveGroups([{ groupId: "g1", name: "我が家", role: "owner" }]);
    });

    await waitFor(() => {
      expect(fetchStockItems).toHaveBeenCalledTimes(1);
    });

    // Never fetched with an undefined active group.
    for (const call of vi.mocked(fetchStockItems).mock.calls) {
      expect(call[1]).toBe("g1");
    }
    expect(stateCallback).toBeTypeOf("function");
  });
});
