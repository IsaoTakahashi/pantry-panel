import { createChunks, MAX_CHUNK_SIZE, stringToBase64URL } from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildSessionCookies,
  readAccessTokenFromCookies,
} from "./sessionCookie";

// session-cookie-pbt: buildSessionCookies / readAccessTokenFromCookies の
// プロパティベーステスト。例ベースのテストは sessionCookie.test.ts に残す。
// テスト設計は openspec/changes/session-cookie-pbt/proposal.md の S-1〜S-4。

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split("");
const REF_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789".split("");

// project ref は英小文字と数字のラベル（new URL() が例外を投げない範囲）。
const projectRefArb = fc.string({
  unit: fc.constantFrom(...REF_ALPHABET),
  minLength: 1,
  maxLength: 20,
});

function supabaseUrlOf(ref: string): string {
  return `https://${ref}.supabase.co`;
}

function cookieKeyOf(ref: string): string {
  return `sb-${ref}-auth-token`;
}

function base64UrlArb(minLength: number, maxLength: number) {
  return fc.string({
    unit: fc.constantFrom(...BASE64URL_ALPHABET),
    minLength,
    maxLength,
  });
}

// JWT 形式（base64url 3 区画を "." でつないだ文字列）。
const accessTokenArb = fc
  .tuple(base64UrlArb(10, 60), base64UrlArb(20, 200), base64UrlArb(20, 90))
  .map((segments) => segments.join("."));

interface SessionParts {
  ref: string;
  accessToken: string;
  userId: string;
  // 日本語・絵文字を含む Unicode 全域の文字列
  name: string;
}

function sessionPartsArb(maxNameLength: number, minNameLength = 0) {
  return fc.record({
    ref: projectRefArb,
    accessToken: accessTokenArb,
    userId: fc.uuid(),
    name: fc.string({
      unit: "grapheme",
      minLength: minNameLength,
      maxLength: maxNameLength,
    }),
  });
}

// padding を user_metadata の Unicode 文字列より前に置く。生 JSON を
// createChunks で分割するとき（S-2）、分割位置が padding ではなく Unicode の
// 部分に来るようにするため。
function makeSession(parts: SessionParts, padding: string): Session {
  return {
    access_token: parts.accessToken,
    refresh_token: "refresh-token",
    expires_in: 3600,
    expires_at: 1_900_000_000,
    token_type: "bearer",
    user: {
      id: parts.userId,
      aud: "authenticated",
      app_metadata: { provider: "email" },
      user_metadata: { padding, name: parts.name },
      created_at: "2026-01-01T00:00:00Z",
    },
  };
}

interface Generated {
  ref: string;
  session: Session;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

// JSON.stringify(session) の UTF-8 バイト長がちょうど byteLength になるよう、
// ASCII の padding で調整する（"a" 1 文字 = 1 バイト）。
function sessionWithJsonBytes(
  parts: SessionParts,
  byteLength: number,
): Session {
  const baseBytes = utf8Length(JSON.stringify(makeSession(parts, "")));
  return makeSession(parts, "a".repeat(byteLength - baseBytes));
}

// cookie 値は "base64-"（7 文字）+ base64url(パディングなし)。JSON の UTF-8
// バイト長を n とすると、cookie 値の長さは 7 + ceil(4n / 3) になる。
// 長さが 4 の倍数の値は作れないので、k * MAX_CHUNK_SIZE ちょうどは作れない。
// すぐ内側（k*3180 - 1, k chunk）と、すぐ外側（k*3180 + 1, k+1 chunk）を狙う。
function jsonBytesForBoundary(k: number, side: "inside" | "outside"): number {
  const inside = (3 * (k * MAX_CHUNK_SIZE - 8)) / 4;
  return side === "inside" ? inside : inside + 1;
}

function boundarySessionArb(
  kArb: fc.Arbitrary<number>,
  sideArb: fc.Arbitrary<"inside" | "outside">,
): fc.Arbitrary<Generated> {
  return fc
    .record({ parts: sessionPartsArb(150), k: kArb, side: sideArb })
    .map(({ parts, k, side }) => ({
      ref: parts.ref,
      session: sessionWithJsonBytes(parts, jsonBytesForBoundary(k, side)),
    }));
}

function paddedSessionArb(
  maxNameLength: number,
  minPadding: number,
  maxPadding: number,
): fc.Arbitrary<Generated> {
  return fc
    .record({
      parts: sessionPartsArb(maxNameLength),
      padding: fc.integer({ min: minPadding, max: maxPadding }),
    })
    .map(({ parts, padding }) => ({
      ref: parts.ref,
      session: makeSession(parts, "a".repeat(padding)),
    }));
}

// cookie が 1 個になるセッション（境界のすぐ内側 3179 を含む）。
const singleChunkSessionArb: fc.Arbitrary<Generated> = fc.oneof(
  paddedSessionArb(100, 0, 1000),
  boundarySessionArb(fc.constant(1), fc.constant("inside")),
);

// cookie が 2 個以上になるセッション（境界のすぐ外側 3181、2 chunk / 3 chunk
// の境界の両側、さらに大きいものを含む）。
const multiChunkSessionArb: fc.Arbitrary<Generated> = fc.oneof(
  paddedSessionArb(500, 3000, 12000),
  boundarySessionArb(fc.constant(1), fc.constant("outside")),
  boundarySessionArb(
    fc.integer({ min: 2, max: 3 }),
    fc.constantFrom("inside", "outside"),
  ),
);

const anySessionArb: fc.Arbitrary<Generated> = fc.oneof(
  singleChunkSessionArb,
  multiChunkSessionArb,
);

function jarFrom(
  cookies: { name: string; value: string }[],
): (name: string) => string | undefined {
  const jar = new Map(cookies.map((c) => [c.name, c.value] as const));
  return (name) => jar.get(name);
}

function encodedValueOf(session: Session): string {
  return `base64-${stringToBase64URL(JSON.stringify(session))}`;
}

describe("sessionCookie のプロパティ", () => {
  describe("S-1: buildSessionCookies → readAccessTokenFromCookies の往復", () => {
    it("生成器が 1 chunk・2 chunk 以上・3 chunk 以上・境界の両側のケースを実際に生成する", () => {
      const samples = fc
        .sample(anySessionArb, { numRuns: 300, seed: 1 })
        .map(({ ref, session }) => {
          const cookies = buildSessionCookies(supabaseUrlOf(ref), session);
          return {
            chunks: cookies.length,
            valueLength: encodedValueOf(session).length,
          };
        });

      const count = (pred: (s: (typeof samples)[number]) => boolean) =>
        samples.filter(pred).length;

      expect(count((s) => s.chunks === 1)).toBeGreaterThan(0);
      expect(count((s) => s.chunks >= 2)).toBeGreaterThan(0);
      expect(count((s) => s.chunks >= 3)).toBeGreaterThan(0);
      // 境界のすぐ内側（1 chunk）・すぐ外側（2 chunk）
      expect(
        count((s) => s.valueLength === MAX_CHUNK_SIZE - 1 && s.chunks === 1),
      ).toBeGreaterThan(0);
      expect(
        count((s) => s.valueLength === MAX_CHUNK_SIZE + 1 && s.chunks === 2),
      ).toBeGreaterThan(0);
      // 2 chunk / 3 chunk の境界の両側
      expect(
        count(
          (s) => s.valueLength === 2 * MAX_CHUNK_SIZE - 1 && s.chunks === 2,
        ),
      ).toBeGreaterThan(0);
      expect(
        count(
          (s) => s.valueLength === 2 * MAX_CHUNK_SIZE + 1 && s.chunks === 3,
        ),
      ).toBeGreaterThan(0);
    });

    it("cookie が 1 個のセッション（境界のすぐ内側を含む）で access_token に戻る", async () => {
      await fc.assert(
        fc.asyncProperty(singleChunkSessionArb, async ({ ref, session }) => {
          const url = supabaseUrlOf(ref);
          const cookies = buildSessionCookies(url, session);
          expect(cookies).toHaveLength(1);

          const token = await readAccessTokenFromCookies(url, jarFrom(cookies));

          expect(token).toBe(session.access_token);
        }),
        { numRuns: 100 },
      );
    });

    it("cookie が複数 chunk のセッション（境界のすぐ外側を含む）で access_token に戻る", async () => {
      await fc.assert(
        fc.asyncProperty(multiChunkSessionArb, async ({ ref, session }) => {
          const url = supabaseUrlOf(ref);
          const cookies = buildSessionCookies(url, session);
          expect(cookies.length).toBeGreaterThanOrEqual(2);

          const token = await readAccessTokenFromCookies(url, jarFrom(cookies));

          expect(token).toBe(session.access_token);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("S-2: 旧形式（base64- 接頭辞のない生 JSON）の cookie", () => {
    it("分割されていない生 JSON の cookie から access_token を読める", async () => {
      await fc.assert(
        fc.asyncProperty(anySessionArb, async ({ ref, session }) => {
          const cookies = [
            { name: cookieKeyOf(ref), value: JSON.stringify(session) },
          ];

          const token = await readAccessTokenFromCookies(
            supabaseUrlOf(ref),
            jarFrom(cookies),
          );

          expect(token).toBe(session.access_token);
        }),
        { numRuns: 100 },
      );
    });

    // 生 JSON は URI エンコードで長さが変わるため、createChunks の "%" エスケープ・
    // Unicode 境界での分割の分岐を通る。"a" は URI エンコードで 1 文字のままなので、
    // encodeURIComponent 後の長さをちょうど k * MAX_CHUNK_SIZE（とその ±1）にできる。
    const rawJsonSplitArb = fc
      .record({
        parts: sessionPartsArb(1500, 30),
        sizing: fc.oneof(
          fc.constant({ kind: "free" as const }),
          fc.record({
            kind: fc.constant("boundary" as const),
            extraK: fc.integer({ min: 0, max: 1 }),
            offset: fc.integer({ min: -1, max: 1 }),
          }),
        ),
      })
      .map(({ parts, sizing }) => {
        const encodedLength = (s: Session) =>
          encodeURIComponent(JSON.stringify(s)).length;
        if (sizing.kind === "free") {
          return { ref: parts.ref, session: makeSession(parts, "") };
        }
        const base = encodedLength(makeSession(parts, ""));
        const k = Math.ceil((base + 1) / MAX_CHUNK_SIZE) + sizing.extraK;
        const target = k * MAX_CHUNK_SIZE + sizing.offset;
        return {
          ref: parts.ref,
          session: makeSession(parts, "a".repeat(target - base)),
        };
      });

    function rawJsonChunks({ ref, session }: Generated) {
      return createChunks(cookieKeyOf(ref), JSON.stringify(session));
    }

    it("生成器がちょうど MAX_CHUNK_SIZE の倍数の長さと、Unicode 境界で短くなった chunk を実際に生成する", () => {
      const samples = fc.sample(rawJsonSplitArb, { numRuns: 200, seed: 1 });

      const exactMultiple = samples.filter(({ session }) => {
        const len = encodeURIComponent(JSON.stringify(session)).length;
        return len % MAX_CHUNK_SIZE === 0;
      });
      const shortenedByUnicode = samples.filter((g) => {
        const chunks = rawJsonChunks(g);
        return chunks
          .slice(0, -1)
          .some((c) => encodeURIComponent(c.value).length < MAX_CHUNK_SIZE);
      });

      const exactLengths = exactMultiple.map(
        ({ session }) => encodeURIComponent(JSON.stringify(session)).length,
      );
      // ちょうど MAX_CHUNK_SIZE（分割されない上限）と、2 倍以上（分割される）の両方
      expect(exactLengths).toContain(MAX_CHUNK_SIZE);
      expect(exactLengths.some((len) => len >= 2 * MAX_CHUNK_SIZE)).toBe(true);
      expect(shortenedByUnicode.length).toBeGreaterThan(0);
    });

    it("Unicode を多く含む生 JSON を createChunks で分割した cookie から access_token を読める", async () => {
      await fc.assert(
        fc.asyncProperty(rawJsonSplitArb, async (generated) => {
          const cookies = rawJsonChunks(generated);

          const token = await readAccessTokenFromCookies(
            supabaseUrlOf(generated.ref),
            jarFrom(cookies),
          );

          expect(token).toBe(generated.session.access_token);
        }),
        { numRuns: 60 },
      );
    });
  });
});
