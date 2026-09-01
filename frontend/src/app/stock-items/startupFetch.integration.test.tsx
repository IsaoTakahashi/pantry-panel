import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import type { GroupInfo } from "@/types/group";
import { useStockItems } from "./useStockItems";

// Integration test: REAL AuthProvider + REAL useStockItems wired exactly like
// StockItemsClient (Harness omits AuthGuard; this matches production, where
// AuthGuard wraps StockItemsClient's returned JSX rather than the component
// itself, so useStockItems always mounts and runs regardless of AuthGuard —
// see the second scenario's comments). Covers two startup-timing scenarios
// for this wiring:
//   1. The original over-fetch-storm bug (#217): groups still in flight when
//      the auth event settles must not cause a fetch with an undefined group.
//   2. The speculative-fetch path (parallelize-auth-init): a localStorage-
//      cached group id lets the fetch start before groups resolve over the
//      network at all.

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

// Mirrors StockItemsClient.tsx wiring: effectiveGroupId falls back to the
// speculative (localStorage-cached) group id until the real group confirms,
// and isGroupConfirmed reflects group !== null rather than authLoading.
function Harness() {
  const { session, group, speculativeGroupId, refreshGroup } = useAuth();
  useStockItems(
    session?.access_token,
    group?.groupId ?? speculativeGroupId,
    refreshGroup,
    group != null,
  );
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

  it("starts fetching with the localStorage-cached speculative group id before groups resolve over the network", async () => {
    // Simulate a returning user: a previous session already cached the active
    // group id, so AuthProvider's lazy initializer exposes it synchronously as
    // speculativeGroupId on the very first render, before any network I/O.
    localStorage.setItem("pantry-panel:active-group-id", "g1");

    const session = { access_token: "tok", user: { id: "u1" } };
    mockGetSession.mockResolvedValue({ data: { session } });
    mockOnAuthStateChange.mockImplementation((cb) => {
      queueMicrotask(() => cb("INITIAL_SESSION", session));
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    // Keep the /groups/me call genuinely in flight so we can observe the
    // speculative fetch firing before it resolves.
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

    // useStockItems's fetch effect guards on both accessToken AND
    // effectiveGroupId being available (it must never fire unauthenticated —
    // see Finding 1 of the final review), so the very first fetch call only
    // happens once getSession() resolves. That resolution is a synchronous
    // localStorage read with no network round trip, so it lands on
    // essentially the same tick as the speculativeGroupId that was already
    // available from the very first render (Harness — like production's
    // StockItemsClient, whose useStockItems call runs regardless of
    // AuthGuard — mounts useStockItems immediately). The first fetch is
    // therefore fetchStockItems("tok", "g1"): the cached speculative id,
    // used in parallel with fetchMyGroups (still pending below) resolving
    // over the network — never an unauthenticated call.
    await waitFor(() => {
      expect(fetchStockItems).toHaveBeenCalledWith("tok", "g1");
    });
    expect(fetchStockItems).not.toHaveBeenCalledWith(undefined, "g1");
    expect(fetchMyGroups).toHaveBeenCalled();

    const callsBeforeConfirmation =
      vi.mocked(fetchStockItems).mock.calls.length;

    // Now let groups resolve to the same id, confirming the speculation.
    await act(async () => {
      resolveGroups([{ groupId: "g1", name: "我が家", role: "owner" }]);
    });

    // Confirmation matches the speculative id, so effectiveGroupId never
    // changes and confirming alone doesn't trigger another fetch.
    expect(vi.mocked(fetchStockItems).mock.calls.length).toBe(
      callsBeforeConfirmation,
    );
    // Nothing ever fetched with a stale or mismatched group.
    for (const call of vi.mocked(fetchStockItems).mock.calls) {
      expect(call[1]).toBe("g1");
    }
  });
});
