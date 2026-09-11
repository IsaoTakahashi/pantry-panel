import { render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StockItemsPage from "@/app/stock-items/page";
import { fetchStockItems } from "@/lib/api";

// Interactive-behavior tests (loading state, item rendering, sign-out,
// modals, etc.) were moved to StockItemsClient.test.tsx in Task 7 — they
// actually exercised StockItemsClient's behavior, not page.tsx's (page.tsx
// was, and still is here, a trivial pass-through). Task 8 rewrites page.tsx
// into an async Server Component and replaces this file's content entirely
// with tests for the Server Component's own data-fetching logic.
vi.mock("@/lib/api");
vi.mock("@/lib/useStockItemsRealtime");
vi.mock("framer-motion", () => {
  const div = ({
    children,
    initial: _i,
    animate: _a,
    exit: _e,
    transition: _t,
    drag: _drag,
    dragControls: _dc,
    dragListener: _dl,
    dragConstraints: _dcon,
    dragElastic: _de,
    onDragEnd: _ode,
    ...rest
  }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => (
    <div {...rest}>{children}</div>
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    m: { div },
    useDragControls: () => ({ start: vi.fn() }),
  };
});
vi.mock("@/components/AuthGuard", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    // biome-ignore lint/suspicious/noExplicitAny: minimal mock; full Session type not needed in tests
    session: { access_token: "test-token" } as any,
    user: null,
    group: { groupId: "group-1", name: "我が家", role: "owner" },
    groups: [{ groupId: "group-1", name: "我が家", role: "owner" }],
    initialGroupId: "group-1",
    initialAuthenticated: false,
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshGroup: vi.fn(),
    switchGroup: vi.fn(),
  }),
}));

describe("StockItemsPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("StockItemsClient を描画する", async () => {
    const { fetchStockItems: mockedFetch } = await import("@/lib/api");
    vi.mocked(mockedFetch).mockResolvedValue([]);

    render(<StockItemsPage />);

    await screen.findByText("商品がありません");
    expect(fetchStockItems).toHaveBeenCalled();
  });
});
