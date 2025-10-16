export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

async function req<T>(path: string, opts: RequestInit = {}, token?: string | null): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type Paymaster = {
  id: number;
  name: string;
  chainID: number;
  entryPoint: string;
  address: string;
  usdcMaxPerOpUSD: number;
  active: boolean;
};

export type ContractWL = {
  id: number;
  address: string;
  label?: string;
  active: boolean;
};

export type FunctionWL = {
  id: number;
  contractId: number;
  selector: string;
  allow: boolean;
  subsidyBps: number;
};

export type UserWL = {
  id: number;
  sender: string;
  active: boolean;
};

export const api = {
  login: (username: string, password: string) =>
    req<{ token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),

  // paymaster overview
  listPaymasters: (token: string) => req<Paymaster[]>("/api/v1/paymasters", {}, token),
  getPaymaster: (token: string, id: number) => req<Paymaster>(`/api/v1/paymasters/${id}`, {}, token),
  updatePaymaster: (token: string, id: number, patch: Partial<Paymaster>) =>
    req(`/api/v1/paymasters/${id}`, { method: "PATCH", body: JSON.stringify(patch) }, token),
  getDeposit: (token: string, id: number) =>
    req<{ depositWei: string }>(`/api/v1/paymasters/${id}/balance`, {}, token),
  getBalance: (token: string, id: number) =>
    req<{ depositWei: string }>(`/api/v1/paymasters/${id}/balance`, {}, token),
  getStats: (token: string, paymasterId: number) =>
    req<any>(`/api/v1/paymasters/${paymasterId}/operations`, {}, token),

  // contracts
  listContracts: (token: string, id: number) =>
    req<ContractWL[]>(`/api/v1/paymasters/${id}/contracts`, {}, token),
  addContract: (token: string, id: number, address: string, label?: string) =>
    req(`/api/v1/paymasters/${id}/contracts`, { method: "POST", body: JSON.stringify({ address, label }) }, token),
  deleteContract: (token: string, id: number, contractId: number) =>
    req(`/api/v1/paymasters/${id}/contracts/${contractId}`, { method: "DELETE" }, token),

  // functions
  listFunctions: (token: string, id: number) =>
    req<FunctionWL[]>(`/api/v1/paymasters/${id}/functions`, {}, token),
  addFunction: (token: string, id: number, contractId: number, selector: string, allow: boolean, subsidyBps: number) =>
    req(`/api/v1/paymasters/${id}/functions`, {
      method: "POST",
      body: JSON.stringify({ contractId, selector, allow, subsidyBps }),
    }, token),
  deleteFunction: (token: string, id: number, functionId: number) =>
    req(`/api/v1/paymasters/${id}/functions/${functionId}`, { method: "DELETE" }, token),

  // users whitelist
  listUsers: (token: string, id: number) =>
    req<UserWL[]>(`/api/v1/paymasters/${id}/users`, {}, token),
  addUser: (token: string, id: number, sender: string) =>
    req(`/api/v1/paymasters/${id}/users`, { method: "POST", body: JSON.stringify({ sender }) }, token),
  deleteUser: (token: string, id: number, userId: number) =>
    req(`/api/v1/paymasters/${id}/users/${userId}`, { method: "DELETE" }, token),
};
