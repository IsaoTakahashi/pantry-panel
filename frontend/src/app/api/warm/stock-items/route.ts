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

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const email = process.env.WARM_USER_EMAIL ?? "";
    const password = process.env.WARM_USER_PASSWORD ?? "";
    const groupId = process.env.WARM_GROUP_ID ?? "";

    const session = await getWarmSession(supabaseUrl, anonKey, email, password);
    const authCookies = buildSessionCookies(supabaseUrl, session);
    const cookieHeader = `${toCookieHeader(authCookies)}; ${ACTIVE_GROUP_COOKIE_NAME}=${groupId}`;

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
