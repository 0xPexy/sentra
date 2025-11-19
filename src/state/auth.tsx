import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api } from "../lib/api";

export type Role = "guest" | "user" | "admin";

type AuthCtx = {
  token: string | null;
  address: `0x${string}` | null;
  role: Role;
  loading: boolean;
  setToken: (t: string | null) => void;
  refreshProfile: () => Promise<void>;
  logout: () => void;
};
const Ctx = createContext<AuthCtx>({
  token: null,
  address: null,
  role: "guest",
  loading: false,
  setToken: () => {},
  refreshProfile: async () => {},
  logout: () => {},
});

const STORAGE_KEY = "jwt";

export const AuthProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [role, setRole] = useState<Role>("guest");
  const [loading, setLoading] = useState<boolean>(Boolean(token));

  const persistToken = useCallback(
    (value: string | null) => {
      setToken(value);
      try {
        if (value) {
          localStorage.setItem(STORAGE_KEY, value);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (error) {
        console.error("Failed to persist token", error);
      }
    },
    []
  );

  const hydrateProfile = useCallback(
    async (jwt: string | null) => {
      if (!jwt) {
        setRole("guest");
        setAddress(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const me = await api.getCurrentUser(jwt);
        setAddress(me.address as `0x${string}`);
        const adminId = typeof me.id === "number" ? me.id : 0;
        setRole(adminId > 0 ? "admin" : "user");
      } catch (error) {
        console.error("Failed to fetch profile", error);
        setRole("guest");
        setAddress(null);
        setToken(null);
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void hydrateProfile(token);
  }, [token, hydrateProfile]);

  const logout = useCallback(() => {
    persistToken(null);
    setRole("guest");
    setAddress(null);
    setLoading(false);
  }, [persistToken]);

  const refreshProfile = useCallback(async () => {
    await hydrateProfile(token);
  }, [token, hydrateProfile]);

  return (
    <Ctx.Provider
      value={{
        token,
        address,
        role,
        loading,
        setToken: persistToken,
        refreshProfile,
        logout,
      }}
    >
      {children}
    </Ctx.Provider>
  );
};
export const useAuth = () => useContext(Ctx);
