import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiFetch, setAccessToken } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  // On first load, try the httpOnly refresh cookie before deciding the user
  // is logged out — this is what makes a page refresh keep you signed in.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE || "http://localhost:4000"}/api/auth/refresh`, {
          method: "POST", credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setAccessToken(data.accessToken);
          const me = await apiFetch("/api/auth/me");
          setUser(me.user);
        }
      } catch {
        /* not logged in — fall through to auth screen */
      } finally {
        setBootstrapping(false);
      }
    })();
  }, []);

  const login = useCallback(async (email, password, rememberMe = false) => {
    const data = await apiFetch("/api/auth/login", { method: "POST", body: { email, password, rememberMe } });
    if (data.requires2FA) return data; // { requires2FA: true, twoFactorToken } — caller must call verifyTwoFactor next
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const verifyTwoFactor = useCallback(async (twoFactorToken, code, rememberMe = false) => {
    const data = await apiFetch("/api/auth/2fa/login-verify", { method: "POST", body: { twoFactorToken, code, rememberMe } });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async ({ name, email, password, dob, gender, phone }) => {
    // Registration always creates a Patient server-side — this call cannot
    // and does not send a role, matching the backend's actual contract.
    await apiFetch("/api/auth/register", { method: "POST", body: { name, email, password, dob, gender, phone } });
    return login(email, password);
  }, [login]);

  const logout = useCallback(async () => {
    try { await apiFetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, bootstrapping, login, register, logout, verifyTwoFactor }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
