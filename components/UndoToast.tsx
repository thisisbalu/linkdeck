"use client";

import { Undo2, X } from "lucide-react";

export function UndoToast({
  message, onUndo, onDismiss, raised = false,
}: {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  /** Sit above the bulk action bar. */
  raised?: boolean;
}) {
  return (
    <div role="status" aria-live="polite"
      className={`fixed ${raised ? "bottom-20" : "bottom-5"} left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg pl-4 pr-2 py-2 shadow-xl text-sm max-w-[90vw]`}
      style={{ background: "var(--app-surface2)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}>
      <span className="truncate max-w-[50vw]">{message}</span>
      <button type="button" onClick={onUndo}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-opacity hover:opacity-80"
        style={{ background: "var(--app-cta-bg)", color: "var(--app-cta-text)" }}>
        <Undo2 className="h-3 w-3" /> Undo
        <kbd className="ml-1 text-[10px] opacity-70 font-normal">⌘Z</kbd>
      </button>
      <button type="button" onClick={onDismiss} title="Dismiss"
        className="h-6 w-6 flex items-center justify-center rounded" style={{ color: "var(--app-text-faint)" }}>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
