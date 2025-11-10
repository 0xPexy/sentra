import { encodeFunctionData, toHex } from "viem";

export const SIMPLE_ACCOUNT_FACTORY_ABI = [
  {
    type: "function",
    name: "getAddress",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "uint256" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "createAccount",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "uint256" },
    ],
    outputs: [{ name: "ret", type: "address" }],
  },
] as const;

export const EXECUTE_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "target", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const SAFE_MINT_ABI = [
  {
    type: "function",
    name: "safeMint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "uri", type: "string" },
    ],
    outputs: [],
  },
] as const;

export const DUMMY_SIGNATURE =
  "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c" as `0x${string}`;

export function packAccountGasLimits(
  callGasLimit: bigint,
  verificationGasLimit: bigint
): `0x${string}` {
  const packed =
    (verificationGasLimit << 128n) | (callGasLimit & ((1n << 128n) - 1n));
  return toHex(packed, { size: 32 }) as `0x${string}`;
}

export function packGasFees(
  maxFeePerGas: bigint,
  maxPriorityFeePerGas: bigint
): `0x${string}` {
  const mask128 = (1n << 128n) - 1n;
  const packed =
    ((maxPriorityFeePerGas & mask128) << 128n) | (maxFeePerGas & mask128);
  return toHex(packed, { size: 32 }) as `0x${string}`;
}

function pad16(value?: bigint): string {
  return toHex(value ?? 0n, { size: 16 }).replace(/^0x/, "");
}

export function buildPaymasterAndData(
  paymaster?: `0x${string}` | undefined,
  verificationGasLimit?: bigint,
  postOpGasLimit?: bigint,
  data?: `0x${string}` | undefined
): `0x${string}` {
  if (!paymaster) return "0x" as `0x${string}`;
  const addr = paymaster.replace(/^0x/, "").padStart(40, "0");
  const verGas = pad16(verificationGasLimit);
  const postGas = pad16(postOpGasLimit);
  const suffix = (data ?? "0x").replace(/^0x/, "");
  return `0x${addr}${verGas}${postGas}${suffix}` as `0x${string}`;
}

export function buildFactoryData(
  owner: `0x${string}`,
  salt: bigint
): `0x${string}` {
  return encodeFunctionData({
    abi: SIMPLE_ACCOUNT_FACTORY_ABI,
    functionName: "createAccount",
    args: [owner, salt],
  });
}
