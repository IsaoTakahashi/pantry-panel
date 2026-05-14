import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStockItemsRealtime } from "./useStockItemsRealtime";

const { mockChannel, mockClient } = vi.hoisted(() => {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  const mockClient = {
    channel: vi.fn().mockReturnValue(mockChannel),
    removeChannel: vi.fn(),
  };
  return { mockChannel, mockClient };
});

vi.mock("./supabaseClient", () => ({
  getSupabaseClient: vi.fn().mockReturnValue(mockClient),
}));

describe("useStockItemRealtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannel.on.mockReturnThis();
    mockChannel.subscribe.mockReturnThis();
    mockClient.channel.mockReturnValue(mockChannel);
  });

  it("マウント時に postgres_changes を subscribe する", () => {
    const onChange = vi.fn();
    renderHook(() => useStockItemsRealtime(onChange));

    expect(mockClient.channel).toHaveBeenCalled();
    expect(mockChannel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ schema: "public", table: "stock_items" }),
      expect.any(Function),
    );
    expect(mockChannel.subscribe).toHaveBeenCalled();
  });

  it("on コールバックが呼ばれると onChange が呼ばれる", () => {
    const onChange = vi.fn();
    renderHook(() => useStockItemsRealtime(onChange));

    // on に渡された 3 番目の引数（イベントコールバック）を取り出して呼ぶ
    const onCallback = mockChannel.on.mock.calls[0][2] as () => void;
    onCallback();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("SUBSCRIBED ステータスで onChange が呼ばれる（再接続修復）", () => {
    const onChange = vi.fn();
    renderHook(() => useStockItemsRealtime(onChange));

    const statusCallback = mockChannel.subscribe.mock.calls[0][0] as (
      s: string,
    ) => void;
    statusCallback("SUBSCRIBED");

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("アンマウント時に removeChannel が呼ばれる", () => {
    const onChange = vi.fn();
    const { unmount } = renderHook(() => useStockItemsRealtime(onChange));
    unmount();

    expect(mockClient.removeChannel).toHaveBeenCalledWith(mockChannel);
  });

  it("client が null のとき subscribe しない", async () => {
    const { getSupabaseClient } = await import("./supabaseClient");
    vi.mocked(getSupabaseClient).mockReturnValue(null);

    const onChange = vi.fn();
    renderHook(() => useStockItemsRealtime(onChange));

    expect(mockClient.channel).not.toHaveBeenCalled();
  });
});
