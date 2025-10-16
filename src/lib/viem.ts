import { createPublicClient, createWalletClient, custom, http, parseEther } from "viem";
import { mainnet, sepolia } from "viem/chains";

// .env: VITE_RPC_URL, VITE_CHAIN (e.g., 'sepolia')
// 퍼블릭(읽기)
export const publicClient = createPublicClient({
  chain: (import.meta.env.VITE_CHAIN === "mainnet" ? mainnet : sepolia),
  transport: http(import.meta.env.VITE_RPC_URL),
});

// 지갑(서명/쓰기) – 브라우저 지갑(EIP-1193)
export function getWalletClient() {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No wallet (window.ethereum) found");
  return createWalletClient({
    chain: (import.meta.env.VITE_CHAIN === "mainnet" ? mainnet : sepolia),
    transport: custom(eth),
  });
}

export const ENTRYPOINT = import.meta.env.VITE_ENTRYPOINT as `0x${string}`;

export const ENTRYPOINT_ABI = [
  {
    type: "function",
    name: "depositTo",
    stateMutability: "payable",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
  },
] as const;

export function parseEthAmountToValue(eth: string) {
  return parseEther(eth as `${number}`);
}
