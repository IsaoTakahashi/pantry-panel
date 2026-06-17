import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installChunkLoadRecovery,
  isChunkLoadError,
  RECOVERY_GUARD_KEY,
  recoverFromChunkLoadError,
} from "./chunkLoadRecovery";

describe("isChunkLoadError", () => {
  it("error.name が ChunkLoadError のとき true", () => {
    const err = new Error("boom");
    err.name = "ChunkLoadError";
    expect(isChunkLoadError(err)).toBe(true);
  });

  it("メッセージに 'Loading chunk' を含むとき true", () => {
    expect(isChunkLoadError(new Error("Loading chunk 42 failed."))).toBe(true);
  });

  it("メッセージに 'dynamically imported module' を含むとき true", () => {
    expect(
      isChunkLoadError(
        new Error("Failed to fetch dynamically imported module: /x.js"),
      ),
    ).toBe(true);
  });

  it("通常のネットワークエラーは false", () => {
    expect(isChunkLoadError(new Error("Failed to fetch"))).toBe(false);
    expect(isChunkLoadError(new TypeError("NetworkError"))).toBe(false);
  });

  it("非 Error 値は false", () => {
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError("Loading chunk 1 failed.")).toBe(false);
  });
});

describe("recoverFromChunkLoadError", () => {
  function makeDeps() {
    const store = new Map<string, string>();
    const unregister1 = vi.fn().mockResolvedValue(true);
    const unregister2 = vi.fn().mockResolvedValue(true);
    return {
      unregister1,
      unregister2,
      caches: {
        keys: vi.fn().mockResolvedValue(["c1", "c2"]),
        delete: vi.fn().mockResolvedValue(true),
      } as unknown as CacheStorage,
      serviceWorker: {
        getRegistrations: vi
          .fn()
          .mockResolvedValue([
            { unregister: unregister1 },
            { unregister: unregister2 },
          ]),
      } as unknown as ServiceWorkerContainer,
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      } as unknown as Storage,
      reload: vi.fn(),
    };
  }

  it("未試行のとき caches 削除・SW 解除・フラグ設定・reload を一度だけ行う", async () => {
    const deps = makeDeps();
    await recoverFromChunkLoadError(deps);

    expect(deps.caches.delete).toHaveBeenCalledTimes(2);
    expect(deps.caches.delete).toHaveBeenCalledWith("c1");
    expect(deps.caches.delete).toHaveBeenCalledWith("c2");
    expect(deps.serviceWorker.getRegistrations).toHaveBeenCalledTimes(1);
    expect(deps.unregister1).toHaveBeenCalledTimes(1);
    expect(deps.unregister2).toHaveBeenCalledTimes(1);
    expect(deps.sessionStorage.getItem(RECOVERY_GUARD_KEY)).toBe("1");
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it("フラグが既に立っているとき何もしない（無限ループ防止）", async () => {
    const deps = makeDeps();
    deps.sessionStorage.setItem(RECOVERY_GUARD_KEY, "1");

    await recoverFromChunkLoadError(deps);

    expect(deps.caches.delete).not.toHaveBeenCalled();
    expect(deps.serviceWorker.getRegistrations).not.toHaveBeenCalled();
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it("フラグはクリーンアップ前に同期的に立てて連続発火での二重回復を防ぐ", async () => {
    const deps = makeDeps();

    const p1 = recoverFromChunkLoadError(deps);
    // 1 回目の await が解決する前に 2 回目が発火してもガード済み
    const p2 = recoverFromChunkLoadError(deps);
    await Promise.all([p1, p2]);

    expect(deps.reload).toHaveBeenCalledTimes(1);
    expect(deps.serviceWorker.getRegistrations).toHaveBeenCalledTimes(1);
  });

  it("unregister が失敗しても reload まで進む", async () => {
    const deps = makeDeps();
    (deps.serviceWorker.getRegistrations as ReturnType<typeof vi.fn>) = vi
      .fn()
      .mockResolvedValue([
        { unregister: vi.fn().mockRejectedValue(new Error("nope")) },
      ]);

    await recoverFromChunkLoadError(deps);

    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it("caches / serviceWorker が無くても throw せず reload する", async () => {
    const store = new Map<string, string>();
    const deps = {
      caches: undefined,
      serviceWorker: undefined,
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      } as unknown as Storage,
      reload: vi.fn(),
    };

    await expect(recoverFromChunkLoadError(deps)).resolves.toBeUndefined();
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });
});

describe("installChunkLoadRecovery", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function setProd() {
    vi.stubEnv("NODE_ENV", "production");
  }

  it("production 以外ではリスナを登録しない", () => {
    vi.stubEnv("NODE_ENV", "development");
    const addSpy = vi.spyOn(window, "addEventListener");
    const cleanup = installChunkLoadRecovery();
    expect(addSpy).not.toHaveBeenCalledWith(
      "unhandledrejection",
      expect.any(Function),
    );
    cleanup?.();
  });

  it("production では error / unhandledrejection を購読する", () => {
    setProd();
    const addSpy = vi.spyOn(window, "addEventListener");
    const cleanup = installChunkLoadRecovery();
    expect(addSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith(
      "unhandledrejection",
      expect.any(Function),
    );
    cleanup?.();
  });

  it("unhandledrejection の reason が ChunkLoadError なら回復する", () => {
    setProd();
    const cleanup = installChunkLoadRecovery();

    const err = new Error("x");
    err.name = "ChunkLoadError";
    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.reject(err).catch(() => {}),
        reason: err,
      }),
    );

    expect(window.sessionStorage.getItem(RECOVERY_GUARD_KEY)).toBe("1");
    cleanup?.();
  });

  it("error イベントの message が ChunkLoadError 相当なら回復する", () => {
    setProd();
    const cleanup = installChunkLoadRecovery();

    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "Loading chunk 7 failed.",
        error: new Error("Loading chunk 7 failed."),
      }),
    );

    expect(window.sessionStorage.getItem(RECOVERY_GUARD_KEY)).toBe("1");
    cleanup?.();
  });

  it("ChunkLoadError でない error は回復しない", () => {
    setProd();
    const cleanup = installChunkLoadRecovery();

    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "Failed to fetch",
        error: new Error("Failed to fetch"),
      }),
    );

    expect(window.sessionStorage.getItem(RECOVERY_GUARD_KEY)).toBeNull();
    cleanup?.();
  });
});
