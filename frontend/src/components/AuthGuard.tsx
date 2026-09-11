"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, group, speculativeGroupId, loading } = useAuth();
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
  if (session && (group || speculativeGroupId)) return <>{children}</>;
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
