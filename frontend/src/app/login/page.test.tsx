import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

const mockPush = vi.fn();
const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: mockUseAuth,
}));

let searchParamsValue = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => searchParamsValue,
}));

function setupAuth(overrides: Record<string, unknown> = {}) {
  mockUseAuth.mockReturnValue({
    session: null,
    user: null,
    groups: [],
    group: null,
    initialGroupId: undefined,
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshGroup: vi.fn(),
    switchGroup: vi.fn(),
    ...overrides,
  });
}

afterEach(() => {
  vi.clearAllMocks();
  searchParamsValue = new URLSearchParams();
});

describe("LoginPage", () => {
  it("error クエリパラメータが無いときエラーメッセージを表示しない", () => {
    setupAuth();
    render(<LoginPage />);
    expect(
      screen.queryByText("ログインに失敗しました。もう一度お試しください。"),
    ).not.toBeInTheDocument();
  });

  it("error=auth_callback_failed のときエラーメッセージを表示する", () => {
    searchParamsValue = new URLSearchParams({ error: "auth_callback_failed" });
    setupAuth();
    render(<LoginPage />);
    expect(
      screen.getByText("ログインに失敗しました。もう一度お試しください。"),
    ).toBeInTheDocument();
  });

  it("未知の error 値のときエラーメッセージを表示しない", () => {
    searchParamsValue = new URLSearchParams({ error: "something_else" });
    setupAuth();
    render(<LoginPage />);
    expect(
      screen.queryByText("ログインに失敗しました。もう一度お試しください。"),
    ).not.toBeInTheDocument();
  });

  it("Googleでサインインボタンをクリックすると引数無しで signInWithGoogle を呼ぶ（内部で /stock-items にデフォルトする）", async () => {
    const signInWithGoogle = vi.fn();
    setupAuth({ signInWithGoogle });
    render(<LoginPage />);
    screen.getByRole("button", { name: /Googleでサインイン/ }).click();
    expect(signInWithGoogle).toHaveBeenCalledWith();
  });
});
