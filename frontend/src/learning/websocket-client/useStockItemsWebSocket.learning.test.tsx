import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStockItemsWebSocket } from "./useStockItemsWebSocket";

let instances: FakeWebSocket[] = [];
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  readyState: number = FakeWebSocket.CONNECTING;
  close = vi.fn();
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    instances.push(this);
  }
}

beforeEach(() => {
  instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useStockItemsWebSocket", () => {
  it("初期状態は lastEvent=null, readyState=CONNECTING", () => {
    const { result } = renderHook(() =>
      useStockItemsWebSocket("ws://localhost"),
    );

    expect(result.current.lastEvent).toEqual(null);
    expect(result.current.readyState).toEqual(WebSocket.CONNECTING);
  });

  it("onmessage 発火後に lastEvent が更新される", async () => {
    const { result } = renderHook(() =>
      useStockItemsWebSocket("ws://localhost"),
    );

    await act(async () => {
      instances[0].onmessage?.({
        data: JSON.stringify({ type: "stock_items.created", payload: {} }),
      } as MessageEvent);
    });

    expect(result.current.lastEvent).toEqual({
      type: "stock_items.created",
      payload: {},
    });
  });

  it("アンマウント時に ws.close() が呼ばれる", () => {
    const { unmount } = renderHook(() =>
      useStockItemsWebSocket("ws://localhost"),
    );

    unmount();

    expect(instances[0].close).toHaveBeenCalled();
  });

  it("onclose 後 500ms で再接続", async () => {
    vi.useFakeTimers();
    renderHook(() => useStockItemsWebSocket("ws://localhost"));

    expect(instances.length).toBe(1);

    await act(async () => {
      instances[0].onclose?.({} as Event);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(instances.length).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(instances.length).toBe(2);
  });

  it("2連続 close で 2回目は 1s", async () => {
    vi.useFakeTimers();
    renderHook(() => useStockItemsWebSocket("ws://localhost"));

    expect(instances.length).toBe(1);

    await act(async () => {
      instances[0].onclose?.({} as Event);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(instances.length).toBe(2);

    await act(async () => {
      instances[1].onclose?.({} as Event);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(instances.length).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(instances.length).toBe(3);
  });

  it("onopen 成功で attempt リセット", async () => {
    vi.useFakeTimers();
    renderHook(() => useStockItemsWebSocket("ws://localhost"));

    expect(instances.length).toBe(1);

    await act(async () => {
      instances[0].onclose?.({} as Event);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(instances.length).toBe(2);

    await act(async () => {
      instances[1].onopen?.({} as Event);
      instances[1].onclose?.({} as Event);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(instances.length).toBe(3);
  });

  it("unmount 中の保留 reconnect は発火しない", async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() =>
      useStockItemsWebSocket("ws://localhost"),
    );

    expect(instances.length).toBe(1);

    await act(async () => {
      instances[0].onclose?.({} as Event);
    });

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(instances.length).toBe(1);
  });
});
