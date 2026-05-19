"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { MdClose } from "react-icons/md";
import { ImageSearchError, searchImages } from "@/lib/api";
import type { ImageSearchResult, StockItem } from "@/types/stockItem";

type Props = {
  item: StockItem;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (imageUrl: string | null) => void;
  accessToken?: string;
};

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; results: ImageSearchResult[] }
  | { status: "error"; kind: "quota" | "other" };

export default function ImageSelectionModal({
  item,
  isOpen,
  onClose,
  onSelect,
  accessToken,
}: Props) {
  const [query, setQuery] = useState(item.name);
  const [state, setState] = useState<FetchState>({ status: "idle" });

  const runSearch = useCallback(
    async (q: string) => {
      setState({ status: "loading" });
      try {
        const results = await searchImages(q, 10, accessToken);
        setState({ status: "success", results });
      } catch (err) {
        const kind =
          err instanceof ImageSearchError && err.kind === "quota"
            ? "quota"
            : "other";
        setState({ status: "error", kind });
      }
    },
    [accessToken],
  );

  useEffect(() => {
    if (!isOpen) return;
    setQuery(item.name);
    void runSearch(item.name);
  }, [isOpen, item.name, runSearch]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop: <button> で a11y 要件（onClick に対応するキーボードイベント）を満たす */}
      <button
        type="button"
        aria-label="モーダルを閉じる"
        className="fixed inset-0 z-40 bg-black/50 cursor-default"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="画像を選択"
          className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto pointer-events-auto"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">画像を選択</h2>
            <button
              type="button"
              aria-label="閉じる"
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <MdClose size={24} aria-hidden />
            </button>
          </div>

          <form
            className="flex gap-2 mb-4"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(query);
            }}
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00d1b2] focus:border-transparent"
            />
            <button
              type="submit"
              className="bg-[#00d1b2] hover:bg-[#00c4a7] text-white px-4 py-2 rounded font-medium"
            >
              検索
            </button>
          </form>

          {state.status === "loading" && (
            <p className="text-center py-8 text-gray-500">検索中...</p>
          )}

          {state.status === "success" && state.results.length === 0 && (
            <p className="text-center py-8 text-gray-500">
              画像が見つかりませんでした
            </p>
          )}

          {state.status === "success" && state.results.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {state.results.map((r) => (
                <button
                  key={r.imageUrl}
                  type="button"
                  onClick={() => onSelect(r.imageUrl)}
                  className="border rounded overflow-hidden hover:ring-2 hover:ring-[#00d1b2] focus:outline-none focus:ring-2 focus:ring-[#00d1b2]"
                >
                  <Image
                    src={r.thumbnailUrl}
                    alt={r.title}
                    unoptimized
                    width={300}
                    height={128}
                    className="w-full h-32 object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {state.status === "error" && state.kind === "quota" && (
            <p className="text-center py-8 text-red-600">
              本日の検索上限に達しました
            </p>
          )}

          {state.status === "error" && state.kind === "other" && (
            <div className="text-center py-8">
              <p className="text-red-600 mb-3">画像検索に失敗しました</p>
              <button
                type="button"
                onClick={() => void runSearch(query)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded font-medium"
              >
                再試行
              </button>
            </div>
          )}

          <div className="flex justify-between mt-6">
            {item.imageUrl != null ? (
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="text-red-600 hover:underline font-medium"
              >
                画像を解除
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded font-medium"
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
