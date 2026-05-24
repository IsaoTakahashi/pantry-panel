"use client";

import { useEffect, useState } from "react";
import {
  ExtractFromUrlError,
  type ExtractionProgressEvent,
  extractFromUrlStream,
} from "@/lib/api";

type UrlRegistrationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onExtracted: (
    name: string,
    imageUrl: string | null,
    sourceUrl: string,
  ) => void;
  accessToken?: string;
  activeGroupId?: string;
};

type ModalState = "idle" | "streaming" | "error" | "nameSelection";

type StepStatus = "done" | "active" | "pending";

type ExtractionStep = {
  id: ExtractionProgressEvent["step"];
  label: string;
  status: StepStatus;
};

const BASE_STEPS: ExtractionStep[] = [
  { id: "fetching", label: "ページを取得中...", status: "pending" },
  { id: "extracting", label: "商品情報を解析中...", status: "pending" },
];

function applyProgress(
  steps: ExtractionStep[],
  step: ExtractionProgressEvent["step"],
  message: string,
): ExtractionStep[] {
  // Mark all previous active steps as done, set matched step to active.
  // If the step is not yet in the list (fetching_jina, generating_candidates), insert it.
  const known = steps.find((s) => s.id === step);
  let updated = steps.map((s) =>
    s.status === "active" ? { ...s, status: "done" as StepStatus } : s,
  );
  if (known) {
    updated = updated.map((s) =>
      s.id === step ? { ...s, status: "active" as StepStatus } : s,
    );
  } else {
    // Insert dynamic steps after the currently done ones
    const insertIdx = updated.findLastIndex((s) => s.status === "done") + 1;
    const newStep: ExtractionStep = {
      id: step,
      label: message,
      status: "active",
    };
    updated = [
      ...updated.slice(0, insertIdx),
      newStep,
      ...updated.slice(insertIdx),
    ];
  }
  return updated;
}

function errorMessage(err: unknown): {
  message: string;
  isExtractionFailed: boolean;
  hasRetryButton: boolean;
  detail?: string;
} {
  if (err instanceof ExtractFromUrlError) {
    switch (err.kind) {
      case "badRequest":
        return {
          message: "有効な URL を入力してください",
          isExtractionFailed: false,
          hasRetryButton: false,
          detail: err.detail,
        };
      case "fetchFailed":
        return {
          message: "ページを取得できませんでした",
          isExtractionFailed: false,
          hasRetryButton: true,
          detail: err.detail,
        };
      case "extractionFailed":
        return {
          message: "商品情報を取得できませんでした。手動で入力してください",
          isExtractionFailed: true,
          hasRetryButton: false,
          detail: err.detail,
        };
      default:
        return {
          message: "エラーが発生しました",
          isExtractionFailed: false,
          hasRetryButton: true,
          detail: err.detail,
        };
    }
  }
  return {
    message: "エラーが発生しました",
    isExtractionFailed: false,
    hasRetryButton: true,
  };
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
  const [showDetail, setShowDetail] = useState(false);
  const [steps, setSteps] = useState<ExtractionStep[]>(BASE_STEPS);
  const [selectionData, setSelectionData] = useState<{
    name: string;
    imageUrl: string | null;
    candidates: string[];
    sourceUrl: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setUrl("");
      setState("idle");
      setError(null);
      setShowDetail(false);
      setSteps(BASE_STEPS);
      setSelectionData(null);
    }
  }, [isOpen]);

  async function submit(urlToSubmit: string) {
    if (!urlToSubmit) return;
    setState("streaming");
    setError(null);
    setSteps(BASE_STEPS);

    await extractFromUrlStream(
      urlToSubmit,
      (ev) => {
        setSteps((prev) => applyProgress(prev, ev.step, ev.message));
      },
      (ev) => {
        if (ev.nameCandidates && ev.nameCandidates.length > 0) {
          setSelectionData({
            name: ev.name,
            imageUrl: ev.imageUrl,
            candidates: ev.nameCandidates,
            sourceUrl: urlToSubmit,
          });
          setState("nameSelection");
        } else {
          onExtracted(ev.name, ev.imageUrl, urlToSubmit);
        }
      },
      (err) => {
        setError(err);
        setState("error");
      },
      accessToken,
      activeGroupId,
    );
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
              type="url"
              className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00d1b2] focus:border-transparent"
              placeholder="https://example.com/product"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={state === "streaming"}
            />
          </div>

          {state === "streaming" && (
            <ol className="mb-4 space-y-2">
              {steps.map((step) => (
                <li key={step.id} className="flex items-center gap-2 text-sm">
                  {step.status === "done" && (
                    <span className="text-green-600 font-bold w-4 text-center">
                      ✓
                    </span>
                  )}
                  {step.status === "active" && (
                    <span
                      aria-hidden="true"
                      className="inline-block w-4 h-4 border-2 border-[#00d1b2] border-t-transparent rounded-full animate-spin flex-shrink-0"
                    />
                  )}
                  {step.status === "pending" && (
                    <span className="w-4 text-center text-gray-300">·</span>
                  )}
                  <span
                    className={
                      step.status === "done"
                        ? "text-gray-500 line-through"
                        : step.status === "active"
                          ? "text-gray-800"
                          : "text-gray-400"
                    }
                  >
                    {step.label}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {state === "nameSelection" && selectionData && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-3">
                商品名を選択してください
              </p>
              <div className="flex flex-col gap-2">
                {selectionData.candidates.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() =>
                      onExtracted(
                        c,
                        selectionData.imageUrl,
                        selectionData.sourceUrl,
                      )
                    }
                    className="bg-[#00d1b2] hover:bg-[#00c4a7] text-white px-4 py-2 rounded font-medium text-sm text-left"
                  >
                    {c}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    onExtracted(
                      selectionData.name,
                      selectionData.imageUrl,
                      selectionData.sourceUrl,
                    )
                  }
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded font-medium text-sm text-left"
                >
                  {selectionData.name}（元の名前）
                </button>
              </div>
            </div>
          )}

          {state === "error" && errInfo && (
            <div className="mb-4">
              <p className="text-red-600 text-sm">{errInfo.message}</p>
              {errInfo.isExtractionFailed ? (
                <button
                  type="button"
                  onClick={() => onExtracted("", null, url)}
                  className="mt-2 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded font-medium text-sm"
                >
                  手動で入力する
                </button>
              ) : errInfo.hasRetryButton ? (
                <button
                  type="button"
                  onClick={() => submit(url)}
                  className="mt-2 bg-[#00d1b2] hover:bg-[#00c4a7] text-white px-4 py-2 rounded font-medium text-sm"
                >
                  再試行
                </button>
              ) : null}
              {errInfo.detail && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowDetail((v) => !v)}
                    className="text-xs text-gray-500 underline"
                  >
                    {showDetail ? "詳細を隠す" : "詳細を表示"}
                  </button>
                  {showDetail && (
                    <pre className="mt-1 text-xs text-gray-600 bg-gray-50 rounded p-2 overflow-auto whitespace-pre-wrap break-all">
                      {errInfo.detail}
                    </pre>
                  )}
                </div>
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
              disabled={
                !url || state === "streaming" || state === "nameSelection"
              }
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
