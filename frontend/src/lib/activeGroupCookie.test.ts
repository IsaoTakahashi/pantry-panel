import { afterEach, describe, expect, it } from "vitest";
import {
  ACTIVE_GROUP_COOKIE_NAME,
  getActiveGroupCookie,
  setActiveGroupCookie,
} from "./activeGroupCookie";

afterEach(() => {
  document.cookie = `${ACTIVE_GROUP_COOKIE_NAME}=; path=/; max-age=0`;
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
    document.cookie = "unrelated=value; path=/";
    expect(getActiveGroupCookie()).toBeUndefined();
  });
});
