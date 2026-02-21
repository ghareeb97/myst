"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef
} from "react";
import { createPortal } from "react-dom";

type ToastKind = "success" | "error" | "info";

type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
};

type ToastAction =
  | { type: "ADD"; toast: Toast }
  | { type: "REMOVE"; id: number };

function toastReducer(state: Toast[], action: ToastAction): Toast[] {
  switch (action.type) {
    case "ADD": {
      const next = [...state, action.toast];
      return next.length > 3 ? next.slice(next.length - 3) : next;
    }
    case "REMOVE":
      return state.filter((t) => t.id !== action.id);
    default:
      return state;
  }
}

type ToastContextValue = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, []);

  const add = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++;
    dispatch({ type: "ADD", toast: { id, kind, message } });
  }, []);

  const remove = useCallback((id: number) => {
    dispatch({ type: "REMOVE", id });
  }, []);

  const ctx: ToastContextValue = {
    success: (msg) => add("success", msg),
    error: (msg) => add("error", msg),
    info: (msg) => add("info", msg)
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <ToastRegion toasts={toasts} onRemove={remove} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const ICONS: Record<ToastKind, string> = {
  success: "✓",
  error: "✕",
  info: "i"
};

function ToastItem({
  toast,
  onRemove
}: {
  toast: Toast;
  onRemove: (id: number) => void;
}) {
  const timerId = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerId.current = setTimeout(() => onRemove(toast.id), 3500);
    return () => {
      if (timerId.current) clearTimeout(timerId.current);
    };
  }, [toast.id, onRemove]);

  return (
    <div
      className={`toast toast--${toast.kind}`}
      role="alert"
      aria-live="assertive"
    >
      <span className="toast__icon">{ICONS[toast.kind]}</span>
      <span className="toast__message">{toast.message}</span>
      <button
        className="toast__dismiss"
        type="button"
        aria-label="Dismiss"
        onClick={() => onRemove(toast.id)}
      >
        ×
      </button>
    </div>
  );
}

function ToastRegion({
  toasts,
  onRemove
}: {
  toasts: Toast[];
  onRemove: (id: number) => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="toast-region" aria-label="Notifications">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>,
    document.body
  );
}
