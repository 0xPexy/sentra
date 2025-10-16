import { keccak256, stringToBytes } from "viem";

export function toSelector(input: string): `0x${string}` {
  const raw = input.trim();
  if (raw === "") throw new Error("empty");
  if (raw.startsWith("0x") && raw.length === 10) {
    return raw as `0x${string}`;
  }
  const hash = keccak256(stringToBytes(raw));
  return `0x${hash.slice(2, 10)}` as `0x${string}`;
}

export function parseSelectorsList(csv: string): `0x${string}`[] {
  return csv
    .split(/[\s,]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map(toSelector);
}
