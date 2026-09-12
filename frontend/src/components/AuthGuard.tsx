"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, group, initialGroupId, initialAuthenticated, loading } =
    useAuth();
  const router = useRouter();
  const authEnabled = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  useEffect(() => {
    if (!authEnabled || loading) return;
    if (session && !group) {
      router.push("/no-group");
    }
  }, [authEnabled, loading, session, group, router]);

  if (!authEnabled) return <>{children}</>;
  // initialAuthenticated が実 session の代わりを務めるのは、クライアントがまだ
  // 何も解決していない間（loading===true、初期状態）に限る。initialAuthenticated
  // はサーバーが認証済みリクエストごとに渡す prop でクライアントからクリア
  // されないため、無条件に代役を務めさせるとゲートが永久に開いたままになり、
  // クライアントが後から session===null を確定させた場合（別タブでのサインアウト、
  // トークン失効等）に Issue #261 の受動的セッション喪失フォールバックへ
  // 到達できなくなる。loading===false になった後は実 session を要求することで、
  // そのケースの挙動を本ブランチ以前と一致させる。
  if (
    (session || (initialAuthenticated && loading)) &&
    (group || initialGroupId)
  )
    return <>{children}</>;
  if (!loading && !session) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6 px-4">
        <h1 className="text-2xl font-bold text-[#00d1b2]">Pantry Panel</h1>
        <p className="text-gray-600 text-center">
          ログインが必要です。
          <br />
          ログイン画面からログインしてください。
        </p>
        <a
          href="/login"
          className="bg-[#00d1b2] hover:bg-[#00c4a7] text-white rounded px-4 py-2 text-sm font-medium"
        >
          ログイン画面へ
        </a>
      </div>
    );
  }

  return null;
}
