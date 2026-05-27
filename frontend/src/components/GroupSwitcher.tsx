"use client";

import { useEffect, useRef, useState } from "react";
import { MdExpandMore, MdGroup } from "react-icons/md";
import type { GroupInfo } from "@/types/group";

type Props = {
  groups: GroupInfo[];
  activeGroup: GroupInfo | null;
  onSwitch: (groupId: string) => void;
  onCreateGroup: (name: string) => Promise<void>;
  onRenameGroup: (groupId: string, name: string) => Promise<void>;
};

export default function GroupSwitcher({
  groups,
  activeGroup,
  onSwitch,
  onCreateGroup,
  onRenameGroup,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setEditingGroupId(null);
        setCreatingNew(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (editingGroupId !== null) {
      renameInputRef.current?.focus();
    }
  }, [editingGroupId]);

  useEffect(() => {
    if (creatingNew) {
      createInputRef.current?.focus();
    }
  }, [creatingNew]);

  const handleRename = async (groupId: string) => {
    const trimmed = editingName.trim();
    if (trimmed) await onRenameGroup(groupId, trimmed);
    setEditingGroupId(null);
  };

  const handleCreateGroup = async () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    await onCreateGroup(trimmed);
    setNewGroupName("");
    setCreatingNew(false);
    setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors text-sm text-slate-600 cursor-pointer border-0"
      >
        <MdGroup aria-hidden size={16} />
        {activeGroup?.name ?? "グループなし"}
        <MdExpandMore aria-hidden size={16} className="opacity-70" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
          {groups.map((g) => {
            const isActive = g.groupId === activeGroup?.groupId;
            const isOwner = g.role === "owner";
            const isEditing = editingGroupId === g.groupId;

            const handleGroupClick = () => {
              if (!isEditing && !isActive) {
                onSwitch(g.groupId);
                setOpen(false);
              }
            };

            return (
              <button
                key={g.groupId}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                onClick={handleGroupClick}
              >
                <span className="w-4 text-[#00d1b2] text-sm flex-shrink-0">
                  {isActive ? "✓" : ""}
                </span>

                {isEditing ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={editingName}
                    className="flex-1 border border-gray-300 rounded px-1 py-0.5 text-sm text-gray-900"
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleRename(g.groupId);
                      }
                      if (e.key === "Escape") setEditingGroupId(null);
                    }}
                    onBlur={(e) => {
                      if (e.relatedTarget) return;
                      handleRename(g.groupId);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : isActive && isOwner ? (
                  <button
                    type="button"
                    data-testid={`group-name-${g.groupId}`}
                    className="flex-1 text-left text-sm text-gray-800 cursor-text hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingGroupId(g.groupId);
                      setEditingName(g.name);
                    }}
                  >
                    {g.name}
                    <span className="ml-1 text-xs text-gray-400">
                      (オーナー)
                    </span>
                  </button>
                ) : (
                  <span
                    data-testid={`group-name-${g.groupId}`}
                    className="flex-1 text-sm text-gray-800"
                  >
                    {g.name}
                    {isOwner && (
                      <span className="ml-1 text-xs text-gray-400">
                        (オーナー)
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}

          <div className="border-t border-gray-100 mt-1 pt-1">
            {creatingNew ? (
              <div className="px-3 py-2">
                <input
                  ref={createInputRef}
                  type="text"
                  placeholder="グループ名"
                  value={newGroupName}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateGroup();
                    if (e.key === "Escape") {
                      setCreatingNew(false);
                      setNewGroupName("");
                    }
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-[#00d1b2] hover:bg-gray-50 flex items-center gap-1"
                onClick={() => setCreatingNew(true)}
              >
                <span>＋</span> 新しいグループを作成
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
