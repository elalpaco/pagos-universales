import { createContext, useCallback, useContext, useRef, useState } from "react";
import Icon from "./icons";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message, type = "info", timeout = 4000) => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, message, type }]);
      if (timeout) {
        setTimeout(() => remove(id), timeout);
      }
      return id;
    },
    [remove]
  );

  const api = {
    show: push,
    success: (msg, timeout) => push(msg, "success", timeout),
    error: (msg, timeout) => push(msg, "error", timeout),
    info: (msg, timeout) => push(msg, "info", timeout),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <Icon
              name={t.type === "success" ? "check" : t.type === "error" ? "alert" : "notifications"}
              size={16}
            />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider");
  return ctx;
}
