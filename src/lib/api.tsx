import { toHex, zeroAddress } from "viem";
import { getPaymasterClient } from "./viem";

export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message || `Request failed with status ${status}`);
    this.status = status;
    this.name = "ApiError";
  }
}

async function req<T>(path: string, opts: RequestInit = {}, token?: string | null): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(import.meta.env.VITE_DEV_TOKEN
        ? { "sentra-dev-token": import.meta.env.VITE_DEV_TOKEN }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || res.statusText);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  try {
    return (await res.json()) as T;
  } catch (error) {
    throw new ApiError(res.status, `Failed to parse response JSON: ${(error as Error).message}`);
  }
}

export type Paymaster = {
  id: number;
  name: string;
  chainId: number;
  entryPoint: string;
  address: string;
  usdcMaxPerOpUSD: number;
  usdPerMaxOp?: number;
  active: boolean;
  users?: string[];
};

export type ContractFunction = {
  id: number;
  selector: string;
  signature?: string | null;
};

export type ContractWL = {
  id: number;
  address: string;
  name?: string | null;
  active: boolean;
  functions: ContractFunction[];
};

export type UserWL = {
  id: number;
  sender: string;
  active: boolean;
};

export type PaymasterResponse = Paymaster & {
  contracts?: ContractWL[];
};

export type PaymasterContextRequest = {
  target: `0x${string}`;
  selector: string;
  args?: unknown[];
  validForSec?: number;
  userOpHash?: `0x${string}`;
};

export type PaymasterUserOperationOverrides = {
  sender?: `0x${string}`;
  nonce?: bigint;
  callData?: `0x${string}`;
  callGasLimit?: bigint;
  preVerificationGas?: bigint;
  verificationGasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  factory?: `0x${string}`;
  factoryData?: `0x${string}`;
  paymasterPostOpGasLimit?: bigint;
  paymasterVerificationGasLimit?: bigint;
};

export type PaymasterRpcRequest = {
  chainId: number;
  entryPoint: `0x${string}`;
  context: PaymasterContextRequest;
  userOperation?: PaymasterUserOperationOverrides;
};

export type PaymasterStubResponse = {
  paymaster: `0x${string}`;
  paymasterData: `0x${string}`;
  paymasterVerificationGasLimit?: string;
  paymasterPostOpGasLimit?: string;
  sponsor?: { name: string; icon?: string };
  isFinal?: boolean;
};

export type PaymasterDataResponse = {
  paymaster: `0x${string}`;
  paymasterData: `0x${string}`;
  paymasterVerificationGasLimit?: string;
  paymasterPostOpGasLimit?: string;
  sponsor?: { name: string; icon?: string };
};

const ZERO_ADDRESS = zeroAddress as `0x${string}`;

function buildUserOperation(overrides?: PaymasterUserOperationOverrides) {
  const base: Record<string, unknown> = {
    sender: overrides?.sender ?? ZERO_ADDRESS,
    nonce: overrides?.nonce ?? 0n,
    callData: overrides?.callData ?? "0x",
    maxFeePerGas: overrides?.maxFeePerGas ?? 0n,
    maxPriorityFeePerGas: overrides?.maxPriorityFeePerGas ?? 0n,
  };
  const optionalBigints: Array<keyof PaymasterUserOperationOverrides> = [
    "callGasLimit",
    "preVerificationGas",
    "verificationGasLimit",
    "paymasterPostOpGasLimit",
    "paymasterVerificationGasLimit",
  ];
  for (const key of optionalBigints) {
    const value = overrides?.[key];
    if (value !== undefined) {
      base[key] = value;
    }
  }
  if (overrides?.factory) base.factory = overrides.factory;
  if (overrides?.factoryData) base.factoryData = overrides.factoryData;
  return base;
}

export async function requestPaymasterStubData(request: PaymasterRpcRequest): Promise<PaymasterStubResponse> {
  const client = getPaymasterClient();
  const result = await client.getPaymasterStubData({
    ...(buildUserOperation(request.userOperation) as any),
    chainId: request.chainId,
    entryPointAddress: request.entryPoint,
    context: request.context ?? {},
  });
  return normalizePaymasterResult(result) as PaymasterStubResponse;
}

export async function requestPaymasterData(request: PaymasterRpcRequest): Promise<PaymasterDataResponse> {
  const client = getPaymasterClient();
  const result = await client.getPaymasterData({
    ...(buildUserOperation(request.userOperation) as any),
    chainId: request.chainId,
    entryPointAddress: request.entryPoint,
    context: request.context ?? {},
  });
  return normalizePaymasterResult(result) as PaymasterDataResponse;
}

function normalizePaymasterResult(result: any) {
  if (!result || typeof result !== "object") return result;
  const copy: any = { ...result };
  if (typeof copy.paymasterPostOpGasLimit === "bigint") {
    copy.paymasterPostOpGasLimit = toHex(copy.paymasterPostOpGasLimit);
  }
  if (typeof copy.paymasterVerificationGasLimit === "bigint") {
    copy.paymasterVerificationGasLimit = toHex(copy.paymasterVerificationGasLimit);
  }
  return copy;
}

export type ContractArtifactResponse = {
  name: string;
  abi: any;
  bytecode: string;
};

export const api = {
  login: (username: string, password: string) =>
    req<{ token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),

  // paymaster overview
  createPaymaster: (token: string, payload: Partial<Paymaster>) =>
    req("/api/v1/paymasters", { method: "POST", body: JSON.stringify(payload) }, token),
  getPaymaster: (token: string) => req<PaymasterResponse>("/api/v1/paymasters/me", {}, token),
  updatePaymaster: (token: string, patch: Partial<Paymaster>, method: "POST" | "PATCH" = "PATCH") =>
    req("/api/v1/paymasters/me", { method, body: JSON.stringify(patch) }, token),
  getStats: (token: string) => req<any>("/api/v1/paymasters/me/operations", {}, token),

  // contracts
  getContractArtifact: (token: string | null | undefined, name: string) =>
    req<ContractArtifactResponse>(`/api/v1/contracts/${encodeURIComponent(name)}`, {}, token ?? undefined),
  listContracts: (token: string) => req<ContractWL[]>("/api/v1/paymasters/me/contracts", {}, token),
  addContract: (
    token: string,
    payload: { address: string; name?: string; functions?: Array<{ selector: string; signature?: string }> }
  ) =>
    req<ContractWL>("/api/v1/paymasters/me/contracts", {
      method: "POST",
      body: JSON.stringify(payload),
    }, token),
  updateContract: (
    token: string,
    contractId: number,
    payload: { address?: string; name?: string | null; functions?: Array<{ selector: string; signature?: string }> }
  ) =>
    req<ContractWL>(`/api/v1/paymasters/me/contracts/${contractId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }, token),
  deleteContract: (token: string, contractId: number) =>
    req(`/api/v1/paymasters/me/contracts/${contractId}`, { method: "DELETE" }, token),

  // users whitelist
  listUsers: (token: string) => req<UserWL[]>("/api/v1/paymasters/me/users", {}, token),
  addUser: (token: string, address: string) =>
    req("/api/v1/paymasters/me/users", { method: "POST", body: JSON.stringify({ address }) }, token),
  deleteUser: (token: string, address: string) =>
    req(`/api/v1/paymasters/me/users/${address}`, { method: "DELETE" }, token),

  // paymaster rpc
  getPaymasterStub: requestPaymasterStubData,
  getPaymasterData: requestPaymasterData,
};
