import { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../utils/config";
import { getGoalsStatus, clearUserCachedData } from "../services/api";
import { migrateLegacyQueue, clearPendingQueue, sweepLegacyOfflineKeys } from "../services/offline";
import {
  getAuthState,
  setAuthState,
  clearAuthState,
  getRefreshToken,
  getUserId,
  setUserId,
  clearUserId,
} from "../services/secureStorage";

const AuthContext = createContext();

// Las instalaciones previas a SecureStore particionaban caché y biblioteca con
// el propio token (`cache:<token>:*`, `library:<token>`): esas claves ya no
// deben existir porque filtran el JWT en claro. Al migrar se eliminan.
const removeLegacyUserKeys = async (oldToken) => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const prefix = `cache:${oldToken}:`;
    const stale = keys.filter((k) => k.startsWith(prefix) || k === `library:${oldToken}`);
    if (stale.length > 0) await AsyncStorage.multiRemove(stale);
  } catch {
    // best-effort: no bloquear el arranque por teclas huérfanas
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setupDone, setSetupDone] = useState(false);
  const [setupReady, setSetupReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const auth = await getAuthState();
        if (auth && auth.token && auth.refreshToken) {
          setUser(auth.user);
          setToken(auth.token);
        } else {
          // Migración única: las instalaciones anteriores a SecureStore guardaban
          // la sesión en AsyncStorage bajo `user`, `token`, `refreshToken`. Se
          // mueve a SecureStore y se re-clavea la cola offline a `offline:<userId>`
          // para no perder sesiones de lectura pendientes. La caché legacy
          // (claveada con el token) se elimina: expone el JWT en AsyncStorage.
          const legacy = await AsyncStorage.multiGet(["user", "token", "refreshToken"]);
          const [savedUser, savedToken, savedRefresh] = legacy.map(([, v]) => v);
          if (savedUser && savedToken && savedRefresh) {
            const savedUserObj = JSON.parse(savedUser);
            await setAuthState({
              user: savedUserObj,
              token: savedToken,
              refreshToken: savedRefresh,
            });
            await setUserId(savedUserObj.id);
            await migrateLegacyQueue(savedToken, String(savedUserObj.id));
            await removeLegacyUserKeys(savedToken);
            await AsyncStorage.multiRemove(["user", "token", "refreshToken"]);
            setUser(savedUserObj);
            setToken(savedToken);
          }
        }
      } catch (e) {
        console.warn("[auth] restauración de sesión falló:", e);
      }
      // Siempre: eliminar claves de cola legacy que pudieran filtrar el JWT.
      await sweepLegacyOfflineKeys();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!user) {
      setSetupDone(false);
      setSetupReady(false);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const local = await AsyncStorage.getItem(`onboarding:${user.id}`);
        let done = local === "done";
        if (!done) {
          try {
            const { hasGoals } = await getGoalsStatus();
            if (hasGoals) {
              await AsyncStorage.setItem(`onboarding:${user.id}`, "done");
              done = true;
            }
          } catch {
            done = true; // sin red: no volver a insistir; se revalida al próximo arranque online
          }
        }
        if (!mounted) return;
        setSetupDone(done);
        setSetupReady(true);
      } catch {
        if (!mounted) return;
        setSetupDone(false);
        setSetupReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  const finishSetup = async () => {
    if (!user) return;
    await AsyncStorage.setItem(`onboarding:${user.id}`, "done");
    setSetupDone(true);
    setSetupReady(true);
  };

  const login = async (email, password) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await setUserId(data.user.id);
    await setAuthState({
      user: data.user,
      token: data.token,
      refreshToken: data.refreshToken,
    });
    setUser(data.user);
    setToken(data.token);
  };

  const register = async (username, email, password, code) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password, code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await setUserId(data.user.id);
    await setAuthState({
      user: data.user,
      token: data.token,
      refreshToken: data.refreshToken,
    });
    setUser(data.user);
    setToken(data.token);
  };

  const logout = async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        await fetch(`${API_URL}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        }).catch(() => {});
      }
    } catch {}
    const userId = await getUserId().catch(() => null);
    await clearAuthState();
    await clearUserId();
    if (userId) {
      // Cierre de fuga latente: no dejar caché/cola del usuario anterior en un
      // dispositivo compartido.
      await Promise.allSettled([clearUserCachedData(userId), clearPendingQueue(userId)]);
    }
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, setupDone, setupReady, finishSetup, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
