"use client";

import { useEffect } from "react";
import { toast, Toaster } from "sonner";

export function ToastProvider() { return <Toaster theme="dark" position="bottom-right" richColors closeButton />; }

export function TransactionFeedback({ message }: { message: string | null }) {
  useEffect(() => {
    if (!message) return;
    if (/Hata:|revert/i.test(message)) toast.error(message);
    else if (/doğrulandı|Zincirde:|Guard çalıştı|borç verildi/.test(message)) toast.success(message);
  }, [message]);
  return <span role="status" className="sr-only">{message}</span>;
}
