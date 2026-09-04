import { renderHook, waitFor } from "@testing-library/react";
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
  getSupabaseClient: vi.fn().mockResolvedValue(mockClient),
}));

// resolve/reject を外部から任意タイミングで発火できる Promise ヘルパー。
// testing.md 2026-09-01 の基準（到着順序を deferred() 相当のヘルパーで書く）に従う。
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("useStockItemRealtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannel.on.mockReturnThis();
    mockChannel.subscribe.mockReturnThis();
    mockClient.channel.mockReturnValue(mockChannel);
  });

  it("マウント時に postgres_changes を subscribe する", async () => {
    const onChange = vi.fn();
    renderHook(() => useStockItemsRealtime(onChange));

    await waitFor(() => {
      expect(mockClient.channel).toHaveBeenCalled();
    });
    expect(mockChannel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ schema: "public", table: "stock_items" }),
      expect.any(Function),
    );
    expect(mockChannel.subscribe).toHaveBeenCalled();
  });

  it("on コールバックが呼ばれると onChange が呼ばれる", async () => {
    const onChange = vi.fn();
    renderHook(() => useStockItemsRealtime(onChange));

    await waitFor(() => {
      expect(mockChannel.on).toHaveBeenCalled();
    });

    // on に渡された 3 番目の引数（イベントコールバック）を取り出して呼ぶ
    const onCallback = mockChannel.on.mock.calls[0][2] as () => void;
    onCallback();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("SUBSCRIBED ステータスになると onChange が呼ばれる（マウント〜購読確立間の取りこぼし救済）", async () => {
    const onChange = vi.fn();
    renderHook(() => useStockItemsRealtime(onChange));

    await waitFor(() => {
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    const statusCallback = mockChannel.subscribe.mock.calls[0][0] as
      | ((s: string) => void)
      | undefined;
    statusCallback?.("SUBSCRIBED");

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("SUBSCRIBED ステータスになると E2E 観測用フラグが立つ（onChange とは独立）", async () => {
    const onChange = vi.fn();
    renderHook(() => useStockItemsRealtime(onChange));

    await waitFor(() => {
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    const statusCallback = mockChannel.subscribe.mock.calls[0][0] as
      | ((s: string) => void)
      | undefined;
    expect(
      (window as unknown as Record<string, unknown>)
        .__supabaseRealtimeSubscribed,
    ).toBeUndefined();

    statusCallback?.("SUBSCRIBED");

    expect(
      (window as unknown as Record<string, unknown>)
        .__supabaseRealtimeSubscribed,
    ).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("resolve より先に unmount した場合、後から SUBSCRIBED が来ても onChange を呼ばない（cancelled ガード）", async () => {
    const onChange = vi.fn();
    const { unmount } = renderHook(() => useStockItemsRealtime(onChange));

    await waitFor(() => {
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    const statusCallback = mockChannel.subscribe.mock.calls[0][0] as
      | ((s: string) => void)
      | undefined;

    unmount();
    statusCallback?.("SUBSCRIBED");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("onChange の identity が変わっても再 subscribe しない（チャンネルは 1 度だけ）", async () => {
    const onChangeA = vi.fn();
    const onChangeB = vi.fn();
    const { rerender } = renderHook(({ cb }) => useStockItemsRealtime(cb), {
      initialProps: { cb: onChangeA },
    });

    await waitFor(() => {
      expect(mockClient.channel).toHaveBeenCalledTimes(1);
    });
    expect(mockChannel.subscribe).toHaveBeenCalledTimes(1);

    rerender({ cb: onChangeB });

    // 再 subscribe / チャンネル再生成は起きない
    expect(mockClient.channel).toHaveBeenCalledTimes(1);
    expect(mockChannel.subscribe).toHaveBeenCalledTimes(1);
    expect(mockClient.removeChannel).not.toHaveBeenCalled();
  });

  it("postgres_changes ハンドラは最新の onChange を呼ぶ", async () => {
    const onChangeA = vi.fn();
    const onChangeB = vi.fn();
    const { rerender } = renderHook(({ cb }) => useStockItemsRealtime(cb), {
      initialProps: { cb: onChangeA },
    });

    await waitFor(() => {
      expect(mockChannel.on).toHaveBeenCalled();
    });

    rerender({ cb: onChangeB });

    const onCallback = mockChannel.on.mock.calls[0][2] as () => void;
    onCallback();

    expect(onChangeA).not.toHaveBeenCalled();
    expect(onChangeB).toHaveBeenCalledTimes(1);
  });

  it("アンマウント時に removeChannel が呼ばれる（resolve が先のケース）", async () => {
    const onChange = vi.fn();
    const { unmount } = renderHook(() => useStockItemsRealtime(onChange));

    await waitFor(() => {
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    unmount();

    expect(mockClient.removeChannel).toHaveBeenCalledWith(mockChannel);
  });

  it("client が null のとき subscribe しない", async () => {
    const { getSupabaseClient } = await import("./supabaseClient");
    vi.mocked(getSupabaseClient).mockResolvedValue(null);

    const onChange = vi.fn();
    renderHook(() => useStockItemsRealtime(onChange));

    // resolve を待っても subscribe されないことを確認する
    await vi.mocked(getSupabaseClient).mock.results[0]?.value;

    expect(mockClient.channel).not.toHaveBeenCalled();
  });

  it("resolve より先に unmount しても removeChannel を呼ばず、クラッシュしない（unmount が先のケース）", async () => {
    const { getSupabaseClient } = await import("./supabaseClient");
    const { promise, resolve } = deferred<typeof mockClient>();
    vi.mocked(getSupabaseClient).mockReturnValue(promise as never);

    const onChange = vi.fn();
    const { unmount } = renderHook(() => useStockItemsRealtime(onChange));

    // getSupabaseClient() の Promise が resolve する前に unmount する
    expect(() => unmount()).not.toThrow();
    expect(mockClient.removeChannel).not.toHaveBeenCalled();

    // unmount 後に resolve しても、subscribe / removeChannel いずれも呼ばれない
    resolve(mockClient);
    await promise;
    await Promise.resolve();

    expect(mockClient.channel).not.toHaveBeenCalled();
    expect(mockClient.removeChannel).not.toHaveBeenCalled();
  });
});
