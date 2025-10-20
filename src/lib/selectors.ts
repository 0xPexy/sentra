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

export type SelectorEntry = {
  selector: `0x${string}`;
  signature?: string;
};

export function parseSelectorsList(csv: string): `0x${string}`[] {
  return parseSelectorEntries(csv).map((entry) => entry.selector);
}

export function parseSelectorEntries(csv: string): SelectorEntry[] {
  if (csv.includes("\n")) {
    throw new Error("Use commas to separate function signatures");
  }

  return csv
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      if (chunk.startsWith("0x")) {
        return { selector: toSelector(chunk) } as SelectorEntry;
      }
      return { selector: toSelector(chunk), signature: chunk } satisfies SelectorEntry;
    });
}
