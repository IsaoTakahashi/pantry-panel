"use client";

import { useEffect, useRef, useState } from "react";
import {
  ExtractFromUrlError,
  type ExtractionProgressEvent,
  extractFromUrlStream,
} from "@/lib/api";
import BaseModal from "./BaseModal";

function isValidUrl(text: string): boolean {
  try {
    const parsed = new URL(text);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

type ClipboardNotice = { type: "notUrl"; text: string } | { type: "failed" };

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
  const known = steps.find((s) => s.id === step);
  let updated = steps.map((s) =>
    s.status === "active" ? { ...s, status: "done" as StepStatus } : s,
  );
  if (known) {
    updated = updated.map((s) =>
      s.id === step ? { ...s, status: "active" as StepStatus } : s,
    );
  } else {
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
  const [clipboardNotice, setClipboardNotice] =
    useState<ClipboardNotice | null>(null);

  const submitRef = useRef(submit);
  // Keep ref current so the clipboard effect can call submit without adding it to deps
  useEffect(() => {
    submitRef.current = submit;
  });

  useEffect(() => {
    if (isOpen) {
      setUrl("");
      setState("idle");
      setError(null);
      setShowDetail(false);
      setSteps(BASE_STEPS);
      setSelectionData(null);
      setClipboardNotice(null);

      if (!navigator?.clipboard?.readText) return;

      navigator.clipboard
        .readText()
        .then((text) => {
          const trimmed = text.trim();
          if (!trimmed) return;
          if (isValidUrl(trimmed)) {
            setUrl(trimmed);
            submitRef.current(trimmed);
          } else {
            setClipboardNotice({ type: "notUrl", text: trimmed });
          }
        })
        .catch(() => {
          setClipboardNotice({ type: "failed" });
        });
    }
  }, [isOpen]);

  async function submit(urlToSubmit: string) {
    if (!urlToSubmit) return;
    setClipboardNotice(null);
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

  const errInfo = error != null ? errorMessage(error) : null;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="URL から商品を登録">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(url);
        }}
      >
        <div className="mb-4">
          <label
            htmlFor="url"
            className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5"
          >
            商品ページの URL
          </label>
          <input
            id="url"
            name="url"
            type="url"
            className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-[#00d1b2] focus:outline-none transition-colors"
            placeholder="https://example.com/product"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setClipboardNotice(null);
            }}
            disabled={state === "streaming"}
          />
          {clipboardNotice && (
            <div
              role="status"
              aria-live="polite"
              className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700"
            >
              <p>URLの読み取りに失敗しました</p>
              {clipboardNotice.type === "notUrl" && (
                <p className="mt-0.5 break-all">
                  {clipboardNotice.text.length > 60
                    ? `${clipboardNotice.text.slice(0, 60)}…`
                    : clipboardNotice.text}
                </p>
              )}
            </div>
          )}
        </div>

        {state === "streaming" && (
          <div className="bg-slate-50 rounded-xl p-3 mb-4">
            <ol className="space-y-2">
              {steps.map((step) => (
                <li key={step.id} className="flex items-center gap-2 text-sm">
                  {step.status === "done" && (
                    <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-xs flex-shrink-0">
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
                    <span className="w-4 h-4 rounded-full border-2 border-slate-200 flex-shrink-0" />
                  )}
                  <span
                    className={
                      step.status === "done"
                        ? "text-slate-400 line-through"
                        : step.status === "active"
                          ? "text-slate-800 font-medium"
                          : "text-slate-300"
                    }
                  >
                    {step.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {state === "nameSelection" && selectionData && (
          <div className="mb-4">
            <p className="text-sm font-medium text-slate-600 mb-3">
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
                  className="bg-[#00d1b2] hover:bg-[#00c4a7] text-white font-bold rounded-xl px-4 py-2.5 text-sm text-left transition-colors"
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
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl px-4 py-2.5 text-sm text-left transition-colors"
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
                className="mt-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl px-4 py-2.5 text-sm transition-colors"
              >
                手動で入力する
              </button>
            ) : errInfo.hasRetryButton ? (
              <button
                type="button"
                onClick={() => submit(url)}
                className="mt-2 bg-[#00d1b2] hover:bg-[#00c4a7] text-white font-bold rounded-xl px-4 py-2.5 text-sm transition-colors"
              >
                再試行
              </button>
            ) : null}
            {errInfo.detail && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowDetail((v) => !v)}
                  className="text-xs text-slate-400 underline"
                >
                  {showDetail ? "詳細を隠す" : "詳細を表示"}
                </button>
                {showDetail && (
                  <pre className="mt-1 text-xs text-slate-600 bg-slate-50 rounded-xl p-2 overflow-auto whitespace-pre-wrap break-all">
                    {errInfo.detail}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 sm:gap-2 sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-none bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl py-2.5 text-sm transition-colors"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={
              !url || state === "streaming" || state === "nameSelection"
            }
            className="flex-[2] sm:flex-none bg-[#00d1b2] hover:bg-[#00c4a7] text-white font-bold rounded-xl py-2.5 text-sm transition-colors disabled:bg-slate-200 disabled:cursor-not-allowed px-6"
          >
            抽出
          </button>
        </div>
      </form>
    </BaseModal>
  );
}
