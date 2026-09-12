import { describe, expect, it, vi } from "vitest";

const mockHeadersGet = vi.fn();
const mockCookiesGet = vi.fn();

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({ get: mockHeadersGet }),
  cookies: () => Promise.resolve({ get: mockCookiesGet }),
}));

describe("getServerAuthBootstrap", () => {
  it("returns initialAuthenticated=true when x-pp-authenticated header is '1'", async () => {
    mockHeadersGet.mockImplementation((name: string) =>
      name === "x-pp-authenticated" ? "1" : null,
    );
    mockCookiesGet.mockReturnValue(undefined);
    const { getServerAuthBootstrap } = await import("./serverAuthBootstrap");

    const result = await getServerAuthBootstrap();

    expect(result.initialAuthenticated).toBe(true);
  });

  it("returns initialAuthenticated=false when header is absent", async () => {
    mockHeadersGet.mockReturnValue(null);
    mockCookiesGet.mockReturnValue(undefined);
    const { getServerAuthBootstrap } = await import("./serverAuthBootstrap");

    const result = await getServerAuthBootstrap();

    expect(result.initialAuthenticated).toBe(false);
  });

  it("returns initialGroupId from the active-group cookie when present", async () => {
    mockHeadersGet.mockReturnValue("1");
    mockCookiesGet.mockImplementation((name: string) =>
      name === "pantry-panel-active-group" ? { value: "group-42" } : undefined,
    );
    const { getServerAuthBootstrap } = await import("./serverAuthBootstrap");

    const result = await getServerAuthBootstrap();

    expect(result.initialGroupId).toBe("group-42");
  });

  it("returns initialGroupId=undefined when the cookie is absent", async () => {
    mockHeadersGet.mockReturnValue("1");
    mockCookiesGet.mockReturnValue(undefined);
    const { getServerAuthBootstrap } = await import("./serverAuthBootstrap");

    const result = await getServerAuthBootstrap();

    expect(result.initialGroupId).toBeUndefined();
  });
});
