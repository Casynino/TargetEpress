"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "@/lib/motion";

/**
 * Toasts.
 *
 * Deliberately hand-rolled rather than another dependency: the app needs
 * exactly four kinds of message and one placement. Bottom-right on desktop,
 * bottom-centre on mobile so it sits above the thumb rather than under it.
 */

type ToastTone = "success" | "error" | "warning" | "info";

type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
};

type ToastInput = Omit<Toast, "id">;

const ToastContext = React.createContext<{
  toast: (input: ToastInput) => void;
} | null>(null);

const TONES: Record<
  ToastTone,
  { icon: typeof CheckCircle2; className: string; iconClass: string }
> = {
  success: {
    icon: CheckCircle2,
    className: "border-success/40 bg-card",
    iconClass: "text-success",
  },
  error: {
    icon: XCircle,
    className: "border-destructive/40 bg-card",
    iconClass: "text-destructive",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-warning/40 bg-card",
    iconClass: "text-warning",
  },
  info: { icon: Info, className: "border-border bg-card", iconClass: "text-brand" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(0);
  // Not `t`: the map below already binds `t` to a toast.
  const translate = useT();

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...input, id }]);
      // Errors stay longer — they usually need reading twice.
      const ttl = input.tone === "error" ? 7000 : 4500;
      setTimeout(() => dismiss(id), ttl);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      <div
        // Announced politely so a screen reader is not interrupted mid-sentence.
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const tone = TONES[t.tone];
            const Icon = tone.icon;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
                className={cn(
                  "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-4 shadow-lift",
                  tone.className
                )}
              >
                <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", tone.iconClass)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{translate(t.title)}</p>
                  {t.description ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {translate(t.description)}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="focus-ring -m-1 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={translate("Dismiss")}
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>.");
  }
  return context;
}
