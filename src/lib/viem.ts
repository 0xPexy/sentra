import {
  type Account,
  type Chain,
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseEther,
  formatEther,
  parseAbi,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import {
  entryPoint08Address,
  createBundlerClient,
  createPaymasterClient,
  type SmartAccount,
  type BundlerClient,
} from "viem/account-abstraction";
import { defineChain } from "viem";

import { toSimpleSmartAccount } from "permissionless/accounts";
export const ENTRYPOINT_ABI = [
  {
    type: "function",
    name: "depositTo",
    stateMutability: "payable",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawTo",
    stateMutability: "nonpayable",
    inputs: [
      { name: "withdrawAddress", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getNonce",
    stateMutability: "view",
    inputs: [
      { name: "sender", type: "address" },
      { name: "key", type: "uint192" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const tenderlyTestNet = defineChain({
  id: 111222111,
  name: "Tenderly Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_RPC_URL],
    },
  },
});

export function parseEthAmountToValue(eth: string) {
  return parseEther(eth as `${number}`);
}

export function formatWeiToEth(value: bigint) {
  return formatEther(value);
}

let cachedHttpClient: ReturnType<typeof createPublicClient> | null = null;


export function getPublicClient() {
  if (!cachedHttpClient) {
    const rpcUrl = import.meta.env.VITE_RPC_URL;
    if (!rpcUrl) {
      throw new Error(
        "VITE_RPC_URL must be defined when no wallet provider is available"
      );
    }
    cachedHttpClient = createPublicClient({
      chain: tenderlyTestNet,
      transport: http(rpcUrl),
    });
  }
  return cachedHttpClient;
}

export async function getWalletClient() {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No wallet (window.ethereum) found");

  const [address] = await eth.request({
    method: "eth_requestAccounts",
  });
  if (!address) {
    throw new Error("Wallet did not return an address");
  }

  return createWalletClient({
    account: address,
    chain: tenderlyTestNet,
    transport: custom(eth),
  });
}

export async function fetchPaymasterDeposit(
  entryPoint: `0x${string}`,
  account: `0x${string}`
) {
  return getPublicClient().readContract({
    address: entryPoint,
    abi: ENTRYPOINT_ABI,
    functionName: "balanceOf",
    args: [account],
  });
}

const paymasterClients = new Map<
  string,
  ReturnType<typeof createPaymasterClient>
>();
let cachedBundlerClient: ReturnType<typeof createBundlerClient> | null = null;

export function getPaymasterClient(token?: string | null) {
  const apiBase = import.meta.env.VITE_API_URL?.replace(/\/+$/, "") ?? "";
  const endpoint = apiBase ? `${apiBase}/api/v1/erc7677` : "/api/v1/erc7677";
  const key = token ?? "__anon__";
  if (!paymasterClients.has(key)) {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (import.meta.env.VITE_DEV_TOKEN) {
      headers.Authorization = `Bearer ${import.meta.env.VITE_DEV_TOKEN}`;
    }
    paymasterClients.set(
      key,
      createPaymasterClient({
        transport: http(endpoint, { fetchOptions: { headers } }),
      })
    );
  }
  return paymasterClients.get(key)!;
}

function resolveChain(chainId?: number | string): Chain | undefined {
  if (!chainId) return undefined;
  const id = typeof chainId === "string" ? Number(chainId) : chainId;
  if (!Number.isFinite(id)) return undefined;
  const knownChains = (window as any)?.__viem?.chains;
  if (Array.isArray(knownChains)) {
    return knownChains.find((chain: Chain) => chain.id === id);
  }
  return undefined;
}

export function getBundlerClient(chainId?: number) {
  if (!cachedBundlerClient) {
    const bundlerUrl = import.meta.env.VITE_BUNDLER_URL;
    if (!bundlerUrl) {
      throw new Error("VITE_BUNDLER_URL is not configured");
    }
    const chain = resolveChain(chainId);
    const basePublicClient = createPublicClient({
      chain,
      transport: http(import.meta.env.VITE_RPC_URL ?? bundlerUrl),
    });
    cachedBundlerClient = createBundlerClient({
      client: basePublicClient,
      transport: http(bundlerUrl),
    });
  }
  return cachedBundlerClient;
}

export async function getSimpleSmartAccount(
  address: `0x${string}`,
  publicClient: PublicClient,
  walletClient: WalletClient<Transport, Chain | undefined, Account>,
  factoryAddress: `0x${string}`,
  salt: bigint = 0n
) {
  const account = await toSimpleSmartAccount({
    owner: walletClient,
    client: publicClient,
    entryPoint: { address: entryPoint08Address, version: "0.8" },
    factoryAddress,
    index: salt
  });
  const resolvedAddress = (await account.getAddress()).toLowerCase();
  if (resolvedAddress !== address.toLowerCase()) {
    throw new Error(
      `Derived smart account address ${resolvedAddress} mismatches expected ${address.toLowerCase()}`
    );
  }
  return account;
}


export function getBundlerClientBySimpleAccount(account: SmartAccount) {
  const bundlerUrl = import.meta.env.VITE_BUNDLER_URL;
  const client = createBundlerClient({
    account,
    transport: http(bundlerUrl),
  })
  return client;
}
