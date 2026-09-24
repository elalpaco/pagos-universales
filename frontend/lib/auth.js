import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "./api";

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = anonymous
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get("/api/me");
      setUser(data.user || data);
      setError(null);
    } catch (err) {
      setUser(null);
      setError(err);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // ignore
    }
    setUser(null);
  }, []);

  return (
    <UserContext.Provider value={{ user, error, refresh, logout, setUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser debe usarse dentro de UserProvider");
  return ctx;
}
