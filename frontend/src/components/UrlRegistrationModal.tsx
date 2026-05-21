"use client";

import { useEffect, useState } from "react";
import { ExtractFromUrlError, extractFromUrl } from "@/lib/api";

type UrlRegistrationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onExtracted: (name: string, imageUrl: string | null) => void;
  accessToken?: string;
  activeGroupId?: string;
};

type ModalState = "idle" | "loading" | "error";

function errorMessage(err: unknown): {
  message: string;
  isExtractionFailed: boolean;
} {
  if (err instanceof ExtractFromUrlError) {
    switch (err.kind) {
      case "badRequest":
        return {
          message: "有効な URL を入力してください",
          isExtractionFailed: false,
        };
      case "fetchFailed":
        return {
          message: "ページを取得できませんでした",
          isExtractionFailed: false,
        };
      case "extractionFailed":
        return {
          message: "商品情報を取得できませんでした。手動で入力してください",
          isExtractionFailed: true,
        };
      default:
        return { message: "エラーが発生しました", isExtractionFailed: false };
    }
  }
  return { message: "エラーが発生しました", isExtractionFailed: false };
}

export default function UrlRegistrationModal({
  isOpen,
  onClose,
  onExtracted,
  accessToken,
  activeGroupId,
}: UrlRegistrationModalProps) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ModalState>("idle");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (isOpen) {
      setUrl("");
      setState("idle");
      setError(null);
    }
  }, [isOpen]);

  async function submit(urlToSubmit: string) {
    if (!urlToSubmit) return;
    setState("loading");
    setError(null);
    try {
      const result = await extractFromUrl(
        urlToSubmit,
        accessToken,
        activeGroupId,
      );
      onExtracted(result.name, result.imageUrl);
    } catch (err) {
      setError(err);
      setState("error");
    }
  }

  if (!isOpen) return null;

  const errInfo = error != null ? errorMessage(error) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="bg-white p-6 rounded-lg shadow-xl w-96">
        <h2 className="text-lg font-semibold mb-6 text-gray-900">
          URL から商品を登録
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(url);
          }}
        >
          <div className="mb-4">
            <label
              htmlFor="url"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              商品ページの URL
            </label>
            <input
              id="url"
              name="url"
              type="text"
              className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00d1b2] focus:border-transparent"
              placeholder="https://example.com/product"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={state === "loading"}
            />
          </div>

          {state === "loading" && (
            <div className="flex items-center gap-2 mb-4 text-gray-600 text-sm">
              <span
                aria-hidden="true"
                className="inline-block w-4 h-4 border-2 border-[#00d1b2] border-t-transparent rounded-full animate-spin"
              />
              解析中...
            </div>
          )}

          {state === "error" && errInfo && (
            <div className="mb-4">
              <p className="text-red-600 text-sm">{errInfo.message}</p>
              {errInfo.isExtractionFailed ? (
                <button
                  type="button"
                  onClick={() => onExtracted("", null)}
                  className="mt-2 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded font-medium text-sm"
                >
                  手動で入力する
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => submit(url)}
                  className="mt-2 bg-[#00d1b2] hover:bg-[#00c4a7] text-white px-4 py-2 rounded font-medium text-sm"
                >
                  再試行
                </button>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded font-medium"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!url || state === "loading"}
              className="bg-[#00d1b2] hover:bg-[#00c4a7] text-white px-4 py-2 rounded font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              抽出
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
