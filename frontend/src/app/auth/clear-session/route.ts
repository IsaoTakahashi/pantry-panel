import { type NextRequest, NextResponse } from "next/server";
import { AUTH_TOKEN_COOKIE_PATTERN } from "@/lib/authCookie";

// 無効なセッション cookie を失効させて /login へ送る。
// 行き先は /login 固定で、クエリ等による指定は受け付けない
// （オープンリダイレクト防止）。ブラウザ側が cookie を残すと
// /login → 保護ルートの redirect ループになるため失効が必要（Issue #260）。
export function GET(request: NextRequest): NextResponse {
  const response = NextResponse.redirect(new URL("/login", request.url));
  for (const cookie of request.cookies.getAll()) {
    if (AUTH_TOKEN_COOKIE_PATTERN.test(cookie.name)) {
      response.cookies.set(cookie.name, "", { path: "/", maxAge: 0 });
    }
  }
  return response;
}
