import { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const AuthContext = createContext();

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.10:3000";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setupDone, setSetupDone] = useState(false);
  const [setupReady, setSetupReady] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet(["user", "token"]).then((values) => {
      const savedUser = values[0][1];
      const savedToken = values[1][1];
      if (savedUser && savedToken) {
        setUser(JSON.parse(savedUser));
        setToken(savedToken);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setSetupDone(false);
      setSetupReady(false);
      return;
    }
    let mounted = true;
    AsyncStorage.getItem(`onboarding:${user.id}`).then((v) => {
      if (!mounted) return;
      setSetupDone(v === "done");
      setSetupReady(true);
    });
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
    await AsyncStorage.multiSet([["user", JSON.stringify(data.user)], ["token", data.token]]);
    setUser(data.user);
    setToken(data.token);
  };

  const register = async (username, email, password) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await AsyncStorage.multiSet([["user", JSON.stringify(data.user)], ["token", data.token]]);
    setUser(data.user);
    setToken(data.token);
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(["user", "token"]);
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
