"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useMounted } from "@/lib/hooks/useMounted";
import { cn } from "@/lib/utils/cn";

export type ToastTone = "default" | "success" | "error" | "warning" | "info";

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Auto-dismiss delay in ms; 0 keeps it until dismissed. */
  duration?: number;
  action?: { label: string; onClick: () => void };
};

type ToastRecord = ToastInput & { id: string };

export type ToastApi = {
  toast: (input: ToastInput) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  /** Shows a toast plus the confetti celebration overlay. */
  celebrate: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
};

const ToastContext = React.createContext<ToastApi | null>(null);

const TONE_STYLES: Record<ToastTone, { icon: React.ReactNode; ring: string }> = {
  default: {
    icon: <Info className="h-4 w-4" aria-hidden />,
    ring: "bg-surface-3 text-muted",
  },
  success: {
    icon: <CheckCircle2 className="h-4 w-4" aria-hidden />,
    ring: "bg-positive-soft text-positive",
  },
  error: {
    icon: <XCircle className="h-4 w-4" aria-hidden />,
    ring: "bg-negative-soft text-negative",
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" aria-hidden />,
    ring: "bg-warning-soft text-warning",
  },
  info: {
    icon: <Info className="h-4 w-4" aria-hidden />,
    ring: "bg-info-soft text-info",
  },
};

const CONFETTI_COLORS = [
  "var(--primary)",
  "var(--positive)",
  "var(--warning)",
  "var(--accent)",
  "var(--info)",
];

/** mulberry32 — deterministic, so confetti positions never change per render. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CONFETTI_PIECES: {
  id: number;
  left: number;
  x: number;
  r: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
}[] = (() => {
  const random = createRandom(0x9e3779b9);
  return Array.from({ length: 26 }, (_, index) => ({
    id: index,
    left: 4 + random() * 92,
    x: (random() - 0.5) * 140,
    r: 180 + random() * 420,
    delay: random() * 220,
    duration: 1100 + random() * 700,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    size: 6 + random() * 5,
  }));
})();

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);
  const [celebration, setCelebration] = React.useState<string | null>(null);
  const mounted = useMounted();
  const timers = React.useRef(new Map<string, number>());
  const celebrateTimer = React.useRef<number | null>(null);

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = React.useCallback(
    (input: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const duration = input.duration ?? (input.tone === "error" ? 6500 : 4200);
      setToasts((current) => [...current.slice(-3), { ...input, id }]);

      if (duration > 0) {
        timers.current.set(
          id,
          window.setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  const api = React.useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) =>
        toast({ title, description, tone: "success" }),
      error: (title, description) => toast({ title, description, tone: "error" }),
      warning: (title, description) =>
        toast({ title, description, tone: "warning" }),
      info: (title, description) => toast({ title, description, tone: "info" }),
      celebrate: (title, description) => {
        const id = toast({ title, description, tone: "success", duration: 5200 });
        setCelebration(title);
        if (celebrateTimer.current) window.clearTimeout(celebrateTimer.current);
        celebrateTimer.current = window.setTimeout(() => setCelebration(null), 1700);
        return id;
      },
      dismiss,
    }),
    [toast, dismiss],
  );

  React.useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => window.clearTimeout(timer));
      if (celebrateTimer.current) window.clearTimeout(celebrateTimer.current);
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted
        ? createPortal(
            <>
              <ConfettiOverlay active={Boolean(celebration)} />

              <div
                aria-live="polite"
                aria-atomic="false"
                className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
              >
                <AnimatePresence initial={false}>
                  {toasts.map((item) => {
                    const tone = item.tone ?? "default";
                    const style = TONE_STYLES[tone];
                    return (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, y: 18, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 24, scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface p-3 shadow-lg"
                        role={tone === "error" ? "alert" : "status"}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                            style.ring,
                          )}
                          aria-hidden
                        >
                          {style.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-snug">
                            {item.title}
                          </p>
                          {item.description ? (
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              {item.description}
                            </p>
                          ) : null}
                          {item.action ? (
                            <button
                              type="button"
                              onClick={() => {
                                item.action?.onClick();
                                dismiss(item.id);
                              }}
                              className="mt-1.5 text-xs font-semibold text-primary underline-offset-2 hover:underline"
                            >
                              {item.action.label}
                            </button>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => dismiss(item.id)}
                          aria-label="Dismiss notification"
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return context;
}

/**
 * Lightweight confetti burst. Purely decorative, sits behind the toast layer
 * and is fully suppressed by prefers-reduced-motion.
 */
function ConfettiOverlay({ active }: { active: boolean }) {
  const reduced = useReducedMotion();

  // Positions come from a module-level seeded generator rather than Math.random:
  // render must be pure, and a fixed seed keeps the burst stable if the
  // component re-renders mid-animation.
  const pieces = CONFETTI_PIECES;

  if (!active || reduced) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-6 z-[55] h-32 overflow-hidden"
      aria-hidden
    >
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="confetti-piece"
          style={
            {
              left: `${piece.left}%`,
              width: piece.size,
              height: piece.size * 1.5,
              background: piece.color,
              "--confetti-x": `${piece.x}px`,
              "--confetti-r": `${piece.r}deg`,
              "--dur": `${piece.duration}ms`,
              "--delay": `${piece.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Tracks the user's motion preference.
 *
 * `useSyncExternalStore` reads the correct value on first render, so there is
 * no flash of animation before the preference is known, and no setState inside
 * an effect to cascade a second render pass.
 */
export function useReducedMotion(): boolean {
  return React.useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    // Server rendering has no media queries; assume motion is allowed and let
    // the CSS media query suppress the animation regardless.
    () => false,
  );
}