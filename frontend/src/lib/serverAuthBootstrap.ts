import { cookies, headers } from "next/headers";
import { ACTIVE_GROUP_COOKIE_NAME } from "@/lib/activeGroupCookie";

export type ServerAuthBootstrap = {
  initialAuthenticated: boolean;
  initialGroupId: string | undefined;
};

// middleware.ts が付与した x-pp-authenticated ヘッダーと、cookie に保存された
// アクティブグループIDを読み、AuthProvider の初期状態を組み立てる（Issue #182）。
// ここで getClaims()/getSession() を呼び直さない — middleware が既に検証済みの
// 結果をヘッダー経由で受け取るだけであり、二重のネットワーク呼び出しを避ける。
export async function getServerAuthBootstrap(): Promise<ServerAuthBootstrap> {
  const headerList = await headers();
  const cookieStore = await cookies();

  const initialAuthenticated = headerList.get("x-pp-authenticated") === "1";
  const initialGroupId = cookieStore.get(ACTIVE_GROUP_COOKIE_NAME)?.value;

  return { initialAuthenticated, initialGroupId };
}
