import { useState } from 'react';

interface ToastProps {
  message: string;
  onDone?: () => void;
}

let toastTimeout: ReturnType<typeof setTimeout> | null = null;

export function useToast() {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => setToast(null), 2500);
  };

  return { toast, showToast };
}

export function Toast({ message }: ToastProps) {
  return <div className="toast">{message}</div>;
}
