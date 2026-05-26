"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useState } from "react";

type BaseModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  // useLayoutEffect runs before paint so the correct layout (mobile vs desktop)
  // is applied on the first frame, preventing the bottom-sheet y-transform from
  // starting when the viewport is already ≥ 640 px.
  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isDesktop;
}

export default function BaseModal({
  isOpen,
  onClose,
  title,
  children,
}: BaseModalProps) {
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const header = (
    <div className="flex justify-between items-center">
      <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="閉じる"
        className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-colors"
      >
        ✕
      </button>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Scrim */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            data-testid="modal-scrim"
          />

          {/* Dialog / Sheet */}
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
            {isDesktop ? (
              <motion.div
                key="desktop-dialog"
                role="dialog"
                aria-modal="true"
                className="pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-w-md"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-6 pt-5 pb-0">{header}</div>
                <div className="h-px bg-slate-100 mt-4" />
                <div className="px-6 pb-6 pt-4">{children}</div>
              </motion.div>
            ) : (
              <motion.div
                key="mobile-sheet"
                role="dialog"
                aria-modal="true"
                className="pointer-events-auto w-full bg-white rounded-t-2xl shadow-xl"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-center pt-3 pb-0">
                  <div
                    className="w-9 h-1 bg-gray-300 rounded-full"
                    aria-hidden="true"
                  />
                </div>
                <div className="px-5 pt-3 pb-0">{header}</div>
                <div className="px-5 pb-6 pt-3">{children}</div>
              </motion.div>
            )}
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
