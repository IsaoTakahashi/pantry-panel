"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { acceptInvitation } from "@/lib/authApi";

type Status = "loading" | "accepting" | "success" | "error" | "invalid";

function JoinContent() {
  const { session, loading, signInWithGoogle } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    if (loading) return;

    if (!session) {
      setStatus("loading"); // 認証待ち（ボタンを表示する）
      return;
    }

    // セッションがある → 招待を承認する
    setStatus("accepting");
    acceptInvitation(token, session.access_token)
      .then(() => {
        setStatus("success");
        router.push("/stock-items");
      })
      .catch((err: Error) => {
        setStatus("error");
        if (err.message.includes("410")) {
          setErrorMessage(
            "この招待リンクは期限切れです。新しいリンクを発行してもらってください。",
          );
        } else if (err.message.includes("404")) {
          setErrorMessage("招待リンクが見つかりませんでした。");
        } else {
          setErrorMessage(
            "参加に失敗しました。しばらく待ってから再試行してください。",
          );
        }
      });
  }, [token, session, loading, router]);

  if (!token || status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">無効な招待リンクです。</p>
      </div>
    );
  }

  if (status === "accepting" || status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">グループに参加しています...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4">
        <p className="text-red-500">{errorMessage}</p>
        <button
          type="button"
          onClick={() => router.push("/no-group")}
          className="text-sm text-[#00d1b2] underline"
        >
          グループページへ戻る
        </button>
      </div>
    );
  }

  // 未ログイン → サインインボタンを表示
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-bold text-[#00d1b2]">Pantry Panel</h1>
      <p className="text-gray-600">グループへの招待を受け取りました</p>
      <button
        type="button"
        onClick={() =>
          signInWithGoogle(
            typeof window !== "undefined" ? window.location.href : undefined,
          )
        }
        className="flex items-center gap-3 bg-white border border-gray-300 rounded-lg px-6 py-3 text-gray-700 font-medium shadow-sm hover:bg-gray-50"
      >
        Googleでサインインして参加する
      </button>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinContent />
    </Suspense>
  );
}
