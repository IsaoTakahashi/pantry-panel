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

// fast-check（4.10.2）の既定 size（"small"）では、maxLength をそれより大きく
// 指定しても文字列の長さは最大 2 * minLength + 10 までしか生成されない。
// このファイルの maxLength は実際に生成される範囲に合わせて指定する。

// project ref は英小文字と数字のラベル（new URL() が例外を投げない範囲）。
const projectRefArb = fc.string({
  unit: fc.constantFrom(...REF_ALPHABET),
  minLength: 1,
  maxLength: 12,
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
  .tuple(base64UrlArb(10, 30), base64UrlArb(20, 50), base64UrlArb(20, 50))
  .map((segments) => segments.join("."));

interface SessionParts {
  ref: string;
  accessToken: string;
  userId: string;
  // 日本語・絵文字を含む Unicode 全域の文字列
  name: string;
}

// maxNameLength は 2 * minNameLength + 10 以下（minNameLength = 0 なら 10、
// 30 なら 70）で指定する。
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

// padding は JSON の長さを調整するための ASCII（"a" の繰り返し）。S-1 では
// base64- 形式の cookie 値の長さ、S-2 では生 JSON を URI エンコードした長さを
// MAX_CHUNK_SIZE の境界に合わせるのに使う。
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
    .record({ parts: sessionPartsArb(10), k: kArb, side: sideArb })
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
  paddedSessionArb(10, 0, 1000),
  boundarySessionArb(fc.constant(1), fc.constant("inside")),
);

// cookie が 2 個以上になるセッション（境界のすぐ外側 3181、2 chunk / 3 chunk
// の境界の両側、さらに大きいものを含む）。
const multiChunkSessionArb: fc.Arbitrary<Generated> = fc.oneof(
  paddedSessionArb(10, 3000, 12000),
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

    // createChunks の分割位置（非最終 chunk の encodeURIComponent 後の長さ L）は
    // 次の 3 通り。chunkSize を cs とする。
    // - L === cs: そのまま切れた
    // - L === cs-1, cs-2: "%XX" の途中で切れたので "%" の手前に詰めた
    // - L <= cs-3: 多バイト文字の UTF-8 の途中で切れて decodeURIComponent が
    //   URIError を投げたので、"%XX" 3 文字ずつ削り直した（ASCII の "%XX" は 1 つ
    //   で必ずデコードできるので、ASCII のエスケープの詰めではここに来ない）
    type Cut = "clean" | "escapeTrim" | "unicodeReslice";

    function cutsOf(chunks: { value: string }[], chunkSize: number): Cut[] {
      return chunks.slice(0, -1).map((c) => {
        const len = encodeURIComponent(c.value).length;
        if (len === chunkSize) return "clean";
        if (len >= chunkSize - 2) return "escapeTrim";
        return "unicodeReslice";
      });
    }

    // 1〜4 バイトの UTF-8 になる文字と、複数のコードポイントからなる絵文字。
    const MULTIBYTE_UNITS = [
      "é",
      "ß",
      "€",
      "あ",
      "漢",
      "字",
      "🍣",
      "🍎",
      "👨‍👩‍👧",
      "🇯🇵",
    ];

    // 日本語・絵文字を必ず含む生 JSON を、小さい chunkSize（S-4 と同じ
    // createChunks の第 3 引数）で必ず分割する。user_metadata.name の多バイト
    // 文字の部分（encodeURIComponent 後 1 文字あたり 6〜36 文字）は chunkSize の
    // 上限より長いので、分割位置が多バイト文字の途中に来るケースを含む。
    const unicodeSplitArb = fc
      .record({
        parts: sessionPartsArb(10),
        multibyte: fc.string({
          unit: fc.constantFrom(...MULTIBYTE_UNITS),
          minLength: 20,
          maxLength: 50,
        }),
        chunkSize: fc.integer({ min: 24, max: 120 }),
      })
      .map(({ parts, multibyte, chunkSize }) => {
        const session = makeSession(
          { ...parts, name: `${parts.name}${multibyte}` },
          "",
        );
        const chunks = createChunks(
          cookieKeyOf(parts.ref),
          JSON.stringify(session),
          chunkSize,
        );
        return { ref: parts.ref, session, chunkSize, chunks };
      });

    it("生成器が多バイト文字の途中での削り直しと、ASCII の %XX の途中での詰めの両方を実際に生成する", () => {
      const samples = fc.sample(unicodeSplitArb, { numRuns: 200, seed: 1 });
      const cutsWith = (kind: Cut) =>
        samples.flatMap(({ chunks, chunkSize }) => {
          const cuts = cutsOf(chunks, chunkSize);
          return chunks.slice(0, -1).filter((_, i) => cuts[i] === kind);
        });
      const isAscii = (ch: string | undefined) =>
        (ch?.codePointAt(0) ?? 0x80) < 0x80;

      const resliced = cutsWith("unicodeReslice");
      // 削り直した chunk は多バイト文字の直前で終わる（デコード後の末尾が非 ASCII
      // になるものを含む）
      expect(resliced.length).toBeGreaterThan(0);
      expect(
        resliced.some(({ value }) => !isAscii(Array.from(value).at(-1))),
      ).toBe(true);
      // ASCII のエスケープ（"%22" など）の途中で切れて詰めたもの
      const asciiEscapeTrim = samples.filter(({ chunks, chunkSize }) => {
        const cuts = cutsOf(chunks, chunkSize);
        return cuts.some(
          (cut, i) => cut === "escapeTrim" && isAscii(chunks[i + 1].value[0]),
        );
      });
      expect(asciiEscapeTrim.length).toBeGreaterThan(0);
    });

    it("日本語・絵文字を含む生 JSON を小さい chunkSize で分割した cookie から access_token を読める", async () => {
      await fc.assert(
        fc.asyncProperty(unicodeSplitArb, async ({ ref, session, chunks }) => {
          expect(chunks.length).toBeGreaterThanOrEqual(2);

          const token = await readAccessTokenFromCookies(
            supabaseUrlOf(ref),
            jarFrom(chunks),
          );

          expect(token).toBe(session.access_token);
        }),
        { numRuns: 100 },
      );
    });

    // 既定の MAX_CHUNK_SIZE で、encodeURIComponent 後の長さをちょうど
    // k * MAX_CHUNK_SIZE とその ±1 にする（"a" は URI エンコードで 1 文字のまま）。
    // MAX_CHUNK_SIZE ちょうどとその -1 は分割されない上限、+1 以降は分割される。
    const rawJsonBoundaryArb = fc
      .record({
        parts: sessionPartsArb(70, 30),
        extraK: fc.integer({ min: 0, max: 1 }),
        offset: fc.integer({ min: -1, max: 1 }),
      })
      .map(({ parts, extraK, offset }) => {
        const encodedLength = (s: Session) =>
          encodeURIComponent(JSON.stringify(s)).length;
        const base = encodedLength(makeSession(parts, ""));
        const k = Math.ceil((base + 1) / MAX_CHUNK_SIZE) + extraK;
        const target = k * MAX_CHUNK_SIZE + offset;
        const session = makeSession(parts, "a".repeat(target - base));
        return {
          ref: parts.ref,
          session,
          encodedLength: encodedLength(session),
          chunks: createChunks(cookieKeyOf(parts.ref), JSON.stringify(session)),
        };
      });

    it("生成器が MAX_CHUNK_SIZE ちょうど（分割なし）と、その 2 倍以上の倍数（分割あり）の長さを実際に生成する", () => {
      const samples = fc.sample(rawJsonBoundaryArb, { numRuns: 200, seed: 1 });
      const exactLengths = samples
        .map((s) => s.encodedLength)
        .filter((len) => len % MAX_CHUNK_SIZE === 0);

      expect(exactLengths).toContain(MAX_CHUNK_SIZE);
      expect(exactLengths.some((len) => len >= 2 * MAX_CHUNK_SIZE)).toBe(true);
      expect(samples.some((s) => s.chunks.length === 1)).toBe(true);
      expect(samples.some((s) => s.chunks.length >= 3)).toBe(true);
    });

    it("長さが MAX_CHUNK_SIZE の倍数とその ±1 の生 JSON を既定の chunkSize で createChunks した cookie から access_token を読める", async () => {
      await fc.assert(
        fc.asyncProperty(
          rawJsonBoundaryArb,
          async ({ ref, session, chunks }) => {
            const token = await readAccessTokenFromCookies(
              supabaseUrlOf(ref),
              jarFrom(chunks),
            );

            expect(token).toBe(session.access_token);
          },
        ),
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
            .string({ minLength: 1, maxLength: 12 })
            .filter((name) => name !== key && !name.startsWith(`${key}.`)),
          value: fc.string({ minLength: 1, maxLength: 12 }),
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
          chunked: paddedSessionArb(10, 0, 500),
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
        generated: paddedSessionArb(10, 0, 500),
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
        old: paddedSessionArb(10, 0, 3000),
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
      base64UrlArb(1, 12).map((v) => `base64-${v}`),
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
