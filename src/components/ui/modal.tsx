"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useMounted } from "@/lib/hooks/useMounted";
import { Button } from "./button";

/**
 * Accessible dialog: focus trap, Escape to close, scroll lock, and a labelled
 * title wired through aria-labelledby / aria-describedby.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  closeOnBackdrop?: boolean;
}) {
  const mounted = useMounted();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();
  const previouslyFocused = React.useRef<HTMLElement | null>(null);
  // Keep the latest handler without re-running the focus setup on every render.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  });

  React.useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const { overflow, paddingRight } = document.body.style;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;

    const focusTimer = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? panelRef.current)?.focus();
    }, 40);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!mounted) return null;

  const widths = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  } as const;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={closeOnBackdrop ? onClose : undefined}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className={cn(
              "relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl",
              widths[size],
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-base font-semibold tracking-tight">
                  {title}
                </h2>
                {description ? (
                  <p
                    id={descriptionId}
                    className="mt-1 text-xs leading-relaxed text-muted-foreground"
                  >
                    {description}
                  </p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close dialog"
                className="-mr-1 shrink-0"
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {children}
            </div>

            {footer ? (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

/* ------------------------------------------------------- Confirm dialog */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={() => void onConfirm()}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
    </Modal>
  );
}