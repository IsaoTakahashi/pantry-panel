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

  describe("S-3: 他の cookie が混ざっていても正しい cookie からトークンを選ぶ", () => {
    // 対象のキーそのもの、または対象のキーの chunk に見える名前は除く。
    const unrelatedCookiesArb = (key: string) =>
      fc.array(
        fc.record({
          name: fc
            .string({ minLength: 1, maxLength: 40 })
            .filter((name) => name !== key && !name.startsWith(`${key}.`)),
          value: fc.string({ minLength: 1, maxLength: 200 }),
        }),
        { maxLength: 5 },
      );

    it("無関係な cookie・別の project ref の cookie を足しても結果が変わらない", async () => {
      const arb = anySessionArb.chain((target) =>
        fc.record({
          target: fc.constant(target),
          other: anySessionArb.filter((other) => other.ref !== target.ref),
          unrelated: unrelatedCookiesArb(cookieKeyOf(target.ref)),
        }),
      );

      await fc.assert(
        fc.asyncProperty(arb, async ({ target, other, unrelated }) => {
          const url = supabaseUrlOf(target.ref);
          const targetCookies = buildSessionCookies(url, target.session);
          const otherCookies = buildSessionCookies(
            supabaseUrlOf(other.ref),
            other.session,
          );

          const alone = await readAccessTokenFromCookies(
            url,
            jarFrom(targetCookies),
          );
          const mixed = await readAccessTokenFromCookies(
            url,
            jarFrom([...unrelated, ...otherCookies, ...targetCookies]),
          );

          expect(alone).toBe(target.session.access_token);
          expect(mixed).toBe(alone);
        }),
        { numRuns: 50 },
      );
    });

    it("分割されていない cookie と .N の chunk が同時にあると、分割されていない方が使われる", async () => {
      const arb = fc
        .record({
          unsplit: singleChunkSessionArb,
          chunked: paddedSessionArb(100, 0, 500),
          chunkSize: fc.integer({ min: 24, max: 120 }),
        })
        .filter(
          ({ unsplit, chunked }) =>
            unsplit.session.access_token !== chunked.session.access_token,
        );

      await fc.assert(
        fc.asyncProperty(arb, async ({ unsplit, chunked, chunkSize }) => {
          const url = supabaseUrlOf(unsplit.ref);
          const key = cookieKeyOf(unsplit.ref);
          const unsplitCookies = buildSessionCookies(url, unsplit.session);
          expect(unsplitCookies.map((c) => c.name)).toEqual([key]);
          // chunkSize を小さくして、同じキーの .0, .1, ... に必ず分割する
          const chunkCookies = createChunks(
            key,
            encodedValueOf(chunked.session),
            chunkSize,
          );
          expect(chunkCookies.length).toBeGreaterThanOrEqual(2);

          // chunk だけなら chunk 側のトークンが読める（chunk 自体は正しい）
          const chunksOnly = await readAccessTokenFromCookies(
            url,
            jarFrom(chunkCookies),
          );
          const both = await readAccessTokenFromCookies(
            url,
            jarFrom([...chunkCookies, ...unsplitCookies]),
          );

          expect(chunksOnly).toBe(chunked.session.access_token);
          expect(both).toBe(unsplit.session.access_token);
        }),
        { numRuns: 50 },
      );
    });
  });

  describe("S-4: 壊れた cookie でも例外を投げず、別のトークンも返さない", () => {
    // 古い chunk・欠けを手早く作るため、小さいセッションを小さい chunkSize で
    // 分割する（createChunks の第 3 引数）。base64- 形式と生 JSON の両方。
    const chunkedArb = fc
      .record({
        generated: paddedSessionArb(100, 0, 500),
        format: fc.constantFrom("base64", "raw"),
        chunkSize: fc.integer({ min: 24, max: 120 }),
      })
      .map(({ generated, format, chunkSize }) => {
        const encode = (session: Session) =>
          format === "base64"
            ? encodedValueOf(session)
            : JSON.stringify(session);
        return { ...generated, encode, chunkSize };
      });

    it("末尾に古い .N が残っていても、正しいトークンか null だけを返す", async () => {
      const arb = fc.record({
        current: chunkedArb,
        old: paddedSessionArb(100, 0, 3000),
        extra: fc.array(fc.string({ unit: "binary", minLength: 1 }), {
          maxLength: 3,
        }),
      });

      await fc.assert(
        fc.asyncProperty(arb, async ({ current, old, extra }) => {
          const key = cookieKeyOf(current.ref);
          const chunks = createChunks(
            key,
            current.encode(current.session),
            current.chunkSize,
          );
          // 以前のセッションの chunk のうち、今の chunk 数より後ろの番号のもの
          // と、任意の文字列を、連番の続き（.n, .n+1, ...）として残す
          const oldValues = createChunks(
            key,
            current.encode(old.session),
            current.chunkSize,
          )
            .slice(chunks.length)
            .map((c) => c.value);
          const staleValues = [...oldValues, ...extra];
          fc.pre(chunks.length >= 2 && staleValues.length > 0);
          const stale = staleValues.map((value, i) => ({
            name: `${key}.${chunks.length + i}`,
            value,
          }));

          const token = await readAccessTokenFromCookies(
            supabaseUrlOf(current.ref),
            jarFrom([...chunks, ...stale]),
          );

          expect([current.session.access_token, null]).toContain(token);
        }),
        { numRuns: 100 },
      );
    });

    it("途中の chunk（.0 を含む）が欠けていても、正しいトークンか null だけを返す", async () => {
      const arb = fc.record({ current: chunkedArb, missing: fc.nat() });

      await fc.assert(
        fc.asyncProperty(arb, async ({ current, missing }) => {
          const chunks = createChunks(
            cookieKeyOf(current.ref),
            current.encode(current.session),
            current.chunkSize,
          );
          fc.pre(chunks.length >= 2);
          const removed = missing % chunks.length;

          const token = await readAccessTokenFromCookies(
            supabaseUrlOf(current.ref),
            jarFrom(chunks.filter((_, i) => i !== removed)),
          );

          expect([current.session.access_token, null]).toContain(token);
        }),
        { numRuns: 100 },
      );
    });

    function parsesToStringAccessToken(value: string): boolean {
      try {
        const parsed: unknown = JSON.parse(value);
        return (
          typeof (parsed as { access_token?: unknown } | null)?.access_token ===
          "string"
        );
      } catch {
        return false;
      }
    }

    const notJsonArb = fc
      .string({ unit: "grapheme", minLength: 1 })
      .filter((value) => {
        try {
          JSON.parse(value);
          return false;
        } catch {
          return true;
        }
      });

    const malformedValueArb = fc.oneof(
      // 空文字（combineChunks が値なしとして扱う）
      fc.constant(""),
      // 任意の文字列（生 JSON として扱われる）
      fc
        .string({ unit: "binary", minLength: 1 })
        .filter((value) => !parsesToStringAccessToken(value)),
      // base64- + 任意の文字列（base64url として不正な文字を含む）
      fc.string({ unit: "binary", minLength: 1 }).map((v) => `base64-${v}`),
      // base64- + base64url の文字だけの文字列（UTF-8 / JSON として不正）
      base64UrlArb(1, 200).map((v) => `base64-${v}`),
      // base64url としては正しいが、JSON として不正
      notJsonArb.map((v) => `base64-${stringToBase64URL(v)}`),
    );

    it("cookie 値が任意の文字列・base64url / JSON として不正な値のとき null を返す", async () => {
      const arb = fc.record({
        ref: projectRefArb,
        value: malformedValueArb,
        chunked: fc.boolean(),
      });

      await fc.assert(
        fc.asyncProperty(arb, async ({ ref, value, chunked }) => {
          const key = cookieKeyOf(ref);
          const name = chunked ? `${key}.0` : key;

          const token = await readAccessTokenFromCookies(
            supabaseUrlOf(ref),
            jarFrom([{ name, value }]),
          );

          expect(token).toBeNull();
        }),
        { numRuns: 200 },
      );
    });

    it("access_token が文字列でない・欠けているとき null を返す", async () => {
      const replacementArb = fc.oneof(
        fc.constant({ kind: "missing" as const }),
        fc.record({
          kind: fc.constant("replaced" as const),
          value: fc.jsonValue().filter((v) => typeof v !== "string"),
        }),
      );
      const arb = fc.record({
        generated: anySessionArb,
        replacement: replacementArb,
        format: fc.constantFrom("base64", "raw"),
      });

      await fc.assert(
        fc.asyncProperty(arb, async ({ generated, replacement, format }) => {
          const { access_token: _removed, ...rest } = generated.session;
          const broken = (replacement.kind === "missing"
            ? rest
            : {
                ...rest,
                access_token: replacement.value,
              }) as unknown as Session;
          const url = supabaseUrlOf(generated.ref);
          const cookies =
            format === "base64"
              ? buildSessionCookies(url, broken)
              : [
                  {
                    name: cookieKeyOf(generated.ref),
                    value: JSON.stringify(broken),
                  },
                ];

          const token = await readAccessTokenFromCookies(url, jarFrom(cookies));

          expect(token).toBeNull();
        }),
        { numRuns: 100 },
      );
    });
  });
});
