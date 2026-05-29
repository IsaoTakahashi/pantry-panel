"use client";

import BaseModal from "./BaseModal";

type ConfirmDialogProps = {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  isOpen,
  message,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <BaseModal isOpen={isOpen} onClose={onCancel} title="確認">
      <p className="text-slate-700 mb-6">{message}</p>
      <div className="flex gap-3 sm:gap-2 sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 sm:flex-none bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl py-2.5 text-sm transition-colors"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 sm:flex-none bg-[#00d1b2] hover:bg-[#00c4a7] text-white font-bold rounded-xl py-2.5 text-sm transition-colors"
        >
          確認
        </button>
      </div>
    </BaseModal>
  );
}
