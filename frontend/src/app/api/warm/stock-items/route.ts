import type { NextRequest } from "next/server";
import { ACTIVE_GROUP_COOKIE_NAME } from "@/lib/activeGroupCookie";
import { buildSessionCookies, toCookieHeader } from "@/lib/sessionCookie";
import { getWarmSession } from "@/lib/warmSession";

const WARMUP_SECRET_HEADER = "x-warmup-secret";

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.WARMUP_SHARED_SECRET;
  const providedSecret = request.headers.get(WARMUP_SECRET_HEADER);

  // WARMUP_SHARED_SECRET 自体が未設定のときも常に unauthorized にする。
  // 「secret 未設定 = 誰でもアクセス可」を許すと、env var 設定漏れがそのまま
  // 本番での認証バイパスになってしまう。
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // NEXT_PUBLIC_* は Next.js のビルド時に静的アクセス（process.env.FOO）だと
  // リテラルへインライン置換される。ここを動的な process.env[name] にすると
  // ビルド時に埋め込まれた値と食い違いうるため、検証は実際に使う変数への
  // 静的アクセスをそのまま並べて行う（各値をここで一度だけ読み、以降は
  // この定数を使い回す）。
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.WARM_USER_EMAIL;
  const password = process.env.WARM_USER_PASSWORD;
  const groupId = process.env.WARM_GROUP_ID;

  // これらのうち一つでも欠けると、空文字 fallback のまま処理を続けてしまい
  // （例: WARM_GROUP_ID なら active-group cookie が空文字のまま internal fetch
  // が 200 を返す）、Go backend への実フェッチを一度も行わないのに warm-up が
  // 「成功」したように見える false positive になる。design.md の "Fail loudly"
  // 方針はこの内部フェッチの成否だけでなく、そもそもこのフローを構成する env var
  // の欠落にも適用されるべきなので、進む前に全部揃っているか検証する。
  const missingVar = (
    [
      ["NEXT_PUBLIC_SUPABASE_URL", supabaseUrl],
      ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey],
      ["WARM_USER_EMAIL", email],
      ["WARM_USER_PASSWORD", password],
      ["WARM_GROUP_ID", groupId],
    ] as const
  ).find(([, value]) => !value)?.[0];
  if (missingVar) {
    return Response.json(
      { error: `missing required env var: ${missingVar}` },
      { status: 500 },
    );
  }

  try {
    const session = await getWarmSession(
      supabaseUrl as string,
      anonKey as string,
      email as string,
      password as string,
    );
    const authCookies = buildSessionCookies(supabaseUrl as string, session);
    const cookieHeader = `${toCookieHeader(authCookies)}; ${ACTIVE_GROUP_COOKIE_NAME}=${groupId as string}`;

    const internalUrl = new URL("/stock-items", request.nextUrl.origin);
    const internalResponse = await fetch(internalUrl, {
      headers: { Cookie: cookieHeader },
      redirect: "manual",
      // キャッシュされたレスポンスで 200 が返ると、ping自体は成功したように
      // 見えても実際には Function を叩いておらずウォームアップの目的を果たさない。
      cache: "no-store",
    });

    if (internalResponse.status === 200) {
      return Response.json({ ok: true }, { status: 200 });
    }

    // 失敗をアプリログ無しでこのエンドポイントのレスポンスだけから
    // 診断できるよう、内部リクエストの status と（あれば）redirect 先を返す。
    return Response.json(
      {
        error: "internal fetch to /stock-items did not return 200",
        status: internalResponse.status,
        location: internalResponse.headers.get("location"),
      },
      { status: 502 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
