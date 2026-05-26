"use client";

import { AnimatePresence, motion, useDragControls } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type BaseModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

function useIsDesktop(): boolean {
  // Lazy initializer reads matchMedia immediately on the client so the first
  // render already knows the correct layout. BaseModal only renders client-side
  // (always starts with isOpen=false), so there is no SSR hydration mismatch.
  const [isDesktop, setIsDesktop] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 640px)").matches,
  );

  useEffect(() => {
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
  const dragControls = useDragControls();

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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            {isDesktop ? (
              <motion.div
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
                role="dialog"
                aria-modal="true"
                className="pointer-events-auto w-full max-w-md bg-white rounded-2xl shadow-xl"
                drag="y"
                dragControls={dragControls}
                dragListener={false}
                dragConstraints={{ top: 0 }}
                dragElastic={{ top: 0.05, bottom: 0.5 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 80 || info.velocity.y > 600) {
                    onClose();
                  }
                }}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="flex justify-center pt-3 pb-2 touch-none cursor-grab active:cursor-grabbing"
                  onPointerDown={(e) => dragControls.start(e)}
                >
                  <div
                    className="w-9 h-1 bg-gray-300 rounded-full"
                    aria-hidden="true"
                  />
                </div>
                <div className="px-5 pt-1 pb-0">{header}</div>
                <div className="px-5 pb-10 pt-3">{children}</div>
              </motion.div>
            )}
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
