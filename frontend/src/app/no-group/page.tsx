"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createGroup } from "@/lib/authApi";

export default function NoGroupPage() {
  const { session, signOut, refreshGroup } = useAuth();
  const router = useRouter();
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateGroup = async () => {
    if (!session || !groupName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createGroup(groupName.trim(), session.access_token);
      await refreshGroup();
      router.push("/stock-items");
    } catch {
      setError("グループの作成に失敗しました");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold text-[#00d1b2]">Pantry Panel</h1>
      <p className="text-gray-600 text-center">
        グループに所属していません。
        <br />
        招待リンクをお持ちの方はリンクを踏んでください。
      </p>

      <div className="bg-white rounded-lg border border-gray-200 p-6 w-full max-w-sm space-y-3">
        <p className="text-sm font-medium text-gray-700">
          新しいグループを作成する
        </p>
        <input
          type="text"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="グループ名（例: 我が家）"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="button"
          onClick={handleCreateGroup}
          disabled={creating || !groupName.trim()}
          className="w-full bg-[#00d1b2] hover:bg-[#00c4a7] disabled:opacity-50 text-white rounded px-4 py-2 text-sm font-medium"
        >
          {creating ? "作成中..." : "グループを作成"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => signOut()}
        className="text-sm text-gray-400 hover:text-gray-600"
      >
        サインアウト
      </button>
    </div>
  );
}
