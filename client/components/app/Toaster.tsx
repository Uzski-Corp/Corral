"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Toast, type ToastProps } from "./primitives";

type ToastInput = Omit<ToastProps, "onClose"> & { duration?: number };
type Live = ToastInput & { id: number };
const Ctx = createContext<(t: ToastInput) => void>(() => {});

/** Wrap the app once. Toasts stack bottom-centre, newest on top, 4s each; hovering pauses nothing (keep them short instead). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Live[]>([]);
  const n = useRef(0);
  const dismiss = useCallback((id: number) => setList((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback((t: ToastInput) => {
    const id = ++n.current;
    setList((l) => [...l.slice(-2), { ...t, id }]);
    setTimeout(() => dismiss(id), t.duration ?? 4000);
  }, [dismiss]);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="c-toasts c-app" aria-live="polite">
        {list.map((t) => <Toast key={t.id} icon={t.icon} tone={t.tone} meta={t.meta} action={t.action} onClose={() => dismiss(t.id)}>{t.children}</Toast>)}
      </div>
    </Ctx.Provider>
  );
}
/** const toast = useToast(); toast({ children: "Enrolled 3 in Cold-room pilot", tone: "success", action: { label: "Undo", onClick } }) */
export const useToast = () => useContext(Ctx);
