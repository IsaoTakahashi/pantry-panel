import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHealth } from "@/lib/api";
import HealthPage from "./page";

vi.mock("@/lib/api");

describe("HealthPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("初期表示でloading状態が表示される", () => {
    vi.mocked(fetchHealth).mockReturnValue(new Promise(() => {})); // 永遠に解決しないPromiseを返す
    render(<HealthPage />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("fetch成功後にok状態が表示される", async () => {
    vi.mocked(fetchHealth).mockResolvedValue({
      status: "ok",
      db: "connected",
    });
    render(<HealthPage />);

    await waitFor(() => {
      expect(screen.getByText("ok")).toBeInTheDocument();
      expect(screen.getByText("connected")).toBeInTheDocument();
    });
  });

  it("fetch失敗後にerror状態が表示される", async () => {
    vi.mocked(fetchHealth).mockResolvedValue({
      status: "error",
      db: "disconnected",
    });
    render(<HealthPage />);

    await waitFor(() => {
      expect(screen.getByText("error")).toBeInTheDocument();
      expect(screen.getByText("disconnected")).toBeInTheDocument();
    });
  });

  it("fetchで例外が発生した場合にerror状態が表示される", async () => {
    vi.mocked(fetchHealth).mockRejectedValue(new Error("Network error"));
    render(<HealthPage />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });
});
