"use client";

import { useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { createInvitation } from "@/lib/authApi";
import type { InvitationResponse } from "@/types/group";

export default function InvitePage() {
  const { session } = useAuth();
  const [invitation, setInvitation] = useState<InvitationResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const inviteUrl = invitation
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/join?token=${invitation.token}`
    : "";

  const handleGenerate = async () => {
    if (!session) return;
    setGenerating(true);
    setError(null);
    try {
      const inv = await createInvitation(session.access_token);
      setInvitation(inv);
    } catch {
      setError("招待リンクの生成に失敗しました");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold text-[#00d1b2]">招待リンクを生成</h1>
      <p className="text-gray-600 text-center text-sm">
        リンクは7日間有効です。家族に送ってグループに招待してください。
      </p>

      {!invitation ? (
        <>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="bg-[#00d1b2] hover:bg-[#00c4a7] disabled:opacity-50 text-white rounded px-6 py-2 font-medium"
          >
            {generating ? "生成中..." : "招待リンクを生成する"}
          </button>
        </>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-4 w-full max-w-md space-y-3">
          <p className="text-xs text-gray-500 break-all">{inviteUrl}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 bg-[#00d1b2] hover:bg-[#00c4a7] text-white rounded px-4 py-2 text-sm font-medium"
            >
              {copied ? "コピー済み ✓" : "URLをコピー"}
            </button>
            <button
              type="button"
              onClick={() => {
                setInvitation(null);
                setCopied(false);
              }}
              className="text-sm text-gray-400 hover:text-gray-600 px-3"
            >
              再生成
            </button>
          </div>
          <p className="text-xs text-gray-400">
            有効期限:{" "}
            {new Date(invitation.expiresAt).toLocaleDateString("ja-JP")}
          </p>
        </div>
      )}
    </div>
  );
}
