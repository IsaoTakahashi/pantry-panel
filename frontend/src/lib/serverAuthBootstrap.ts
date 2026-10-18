import { cookies, headers } from "next/headers";
import { ACTIVE_GROUP_COOKIE_NAME } from "@/lib/activeGroupCookie";

export type ServerAuthBootstrap = {
  initialAuthenticated: boolean;
  initialGroupId: string | undefined;
};

// middleware.ts が付与した x-pp-authenticated ヘッダーと、cookie に保存された
// アクティブグループIDを読み、AuthProvider の初期状態を組み立てる（Issue #182）。
// ここで getClaims()/getSession() を呼び直さない — middleware の判定結果を
// ヘッダー経由で受け取るだけであり、二重のネットワーク呼び出しを避ける。
// /stock-items ではこのヘッダーは「期限内のセッションがある」という署名未検証の
// ヒント（他の保護ルートは getClaims() で検証済み）。UX 上の初期状態を決めるため
// だけに使い、認可の根拠にはしない。データは各経路が独立して認可する。
export async function getServerAuthBootstrap(): Promise<ServerAuthBootstrap> {
  const headerList = await headers();
  const cookieStore = await cookies();

  const initialAuthenticated = headerList.get("x-pp-authenticated") === "1";
  const initialGroupId = cookieStore.get(ACTIVE_GROUP_COOKIE_NAME)?.value;

  return { initialAuthenticated, initialGroupId };
}
