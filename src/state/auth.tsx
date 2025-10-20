import React, { createContext, useContext, useState } from "react";

const BYPASS = import.meta.env.VITE_AUTH_BYPASS === "1";
const BYPASS_TOKEN = import.meta.env.VITE_DEV_TOKEN || "dev-token";

type AuthCtx = {
  token: string | null;
  setToken: (t: string | null) => void;
  logout: () => void;
};
const Ctx = createContext<AuthCtx>({
  token: null,
  setToken: () => {},
  logout: () => {},
});

export const AuthProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [token, setToken] = useState<string | null>(() =>
    BYPASS ? BYPASS_TOKEN : localStorage.getItem("jwt")
  );
  const logout = () => {
    if (BYPASS) return; // dev 모드에선 무시
    setToken(null);
    localStorage.removeItem("jwt");
  };
  const setAndPersist = (t: string | null) => {
    if (BYPASS) {
      setToken(BYPASS_TOKEN);
      return;
    }
    setToken(t);
    t ? localStorage.setItem("jwt", t) : localStorage.removeItem("jwt");
  };
  return (
    <Ctx.Provider value={{ token, setToken: setAndPersist, logout }}>
      {children}
    </Ctx.Provider>
  );
};
export const useAuth = () => useContext(Ctx);
