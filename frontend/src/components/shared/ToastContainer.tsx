"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";

const icons = {
  success: <CheckCircle2 size={16} className="text-green-400 shrink-0" />,
  error: <AlertCircle size={16} className="text-red-400 shrink-0" />,
  info: <Info size={16} className="text-indigo-400 shrink-0" />,
};

export function ToastContainer() {
  const { toasts, removeToast } = useUIStore();

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <Toast key={t.id} {...t} onDismiss={() => removeToast(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function Toast({ id, message, type, onDismiss }: { id: string; message: string; type: "success" | "error" | "info"; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, type === "success" ? 1500 : 4000);
    return () => clearTimeout(timer);
  }, [onDismiss, type]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="pointer-events-auto glass-elevated flex items-center gap-3 px-4 py-3 min-w-[260px] max-w-[380px]"
    >
      {icons[type]}
      <span className="text-sm flex-1" style={{ color: "var(--text)" }}>{message}</span>
      <button onClick={onDismiss} className="ml-1 opacity-50 hover:opacity-100 transition-opacity">
        <X size={14} />
      </button>
    </motion.div>
  );
}
