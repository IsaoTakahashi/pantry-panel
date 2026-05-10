import { describe, expect, it } from "vitest";
import { computeBackoff } from "./computeBackoff";

describe("computeBackoff", () => {
  it.each([
    [0, 500],
    [1, 1000],
    [2, 2000],
    [3, 5000],
    [4, 10000],
    [5, 10000],
    [100, 10000],
  ])("attempt=%i → %ims", (attempt, expected) => {
    expect(computeBackoff(attempt)).toBe(expected);
  });
});
