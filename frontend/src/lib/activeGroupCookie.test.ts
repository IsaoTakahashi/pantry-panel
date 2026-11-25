import { afterEach, describe, expect, it } from "vitest";
import {
  ACTIVE_GROUP_COOKIE_NAME,
  clearActiveGroupCookie,
  getActiveGroupCookie,
  setActiveGroupCookie,
} from "./activeGroupCookie";

afterEach(() => {
  clearActiveGroupCookie();
});

describe("activeGroupCookie", () => {
  it("ACTIVE_GROUP_COOKIE_NAME is the shared cookie name", () => {
    expect(ACTIVE_GROUP_COOKIE_NAME).toBe("pantry-panel-active-group");
  });

  it("getActiveGroupCookie returns undefined when no cookie is set", () => {
    expect(getActiveGroupCookie()).toBeUndefined();
  });

  it("setActiveGroupCookie writes a cookie readable by getActiveGroupCookie", () => {
    setActiveGroupCookie("group-123");
    expect(getActiveGroupCookie()).toBe("group-123");
  });

  it("setActiveGroupCookie overwrites a previous value", () => {
    setActiveGroupCookie("group-1");
    setActiveGroupCookie("group-2");
    expect(getActiveGroupCookie()).toBe("group-2");
  });

  it("getActiveGroupCookie ignores unrelated cookies", () => {
    // biome-ignore lint/suspicious/noDocumentCookie: seeds a cookie the module under test does not own
    document.cookie = "unrelated=value; path=/";
    expect(getActiveGroupCookie()).toBeUndefined();
  });

  it("clearActiveGroupCookie removes a previously set cookie", () => {
    setActiveGroupCookie("group-123");
    clearActiveGroupCookie();
    expect(getActiveGroupCookie()).toBeUndefined();
  });
});
