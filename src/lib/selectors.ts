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

  const chunks = splitSignatures(csv);

  return chunks
    .map((chunk) => {
      if (chunk.startsWith("0x")) {
        return { selector: toSelector(chunk) } as SelectorEntry;
      }
      return { selector: toSelector(chunk), signature: chunk } satisfies SelectorEntry;
    });
}

function splitSignatures(csv: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of csv) {
    if (char === "," && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = "";
      continue;
    }
    current += char;
    if (char === "(") depth += 1;
    else if (char === ")" && depth > 0) depth -= 1;
  }

  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);
  return parts;
}
