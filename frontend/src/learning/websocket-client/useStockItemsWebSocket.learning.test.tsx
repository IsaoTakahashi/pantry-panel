import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStockItemsWebSocket } from "./useStockItemsWebSocket";

let fakeWs: FakeWebSocket;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  readyState: number = WebSocket.CONNECTING;
  close = vi.fn();
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    fakeWs = this;
  }
}

beforeEach(() => {
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
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
      fakeWs.onmessage?.({
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

    expect(fakeWs.close).toHaveBeenCalled();
  });
});
