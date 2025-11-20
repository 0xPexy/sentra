export type SentraEvent = {
  userOpHash?: `0x${string}`;
  sender?: `0x${string}`;
  paymaster?: `0x${string}`;
  target?: `0x${string}`;
  selector?: `0x${string}`;
  status?: string;
  blockNumber?: number;
  logIndex?: number;
  txHash?: `0x${string}`;
  actualGasUsed?: string;
  actualGasCost?: string;
  beneficiary?: `0x${string}`;
  callGasLimit?: string;
  verificationGasLimit?: string;
  preVerificationGas?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  paymasterVerificationGasLimit?: string;
  paymasterPostOpGasLimit?: string;
  blockTime?: string;
};

export type EventStatusPayload = {
  userOpHash?: string;
  status?: string;
  txHash?: string;
  blockNumber?: number;
};

export const EVENT_STATUS_PREFIX = "[event]";

export function formatEventStatusLine(event: SentraEvent): string {
  const payload: EventStatusPayload = {
    userOpHash: event.userOpHash,
    status: event.status,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
  };
  return `${EVENT_STATUS_PREFIX}${JSON.stringify(payload)}`;
}

export function parseEventStatusLine(
  line: string
): EventStatusPayload | null {
  if (!line.startsWith(EVENT_STATUS_PREFIX)) return null;
  try {
    return JSON.parse(line.slice(EVENT_STATUS_PREFIX.length));
  } catch {
    return null;
  }
}

export function resolveEventsWsUrl() {
  const apiBase = import.meta.env.API_URL?.replace(/\/+$/, "");
  if (apiBase) {
    const url = new URL(apiBase);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/api/v1/events";
    url.search = "";
    return url.toString();
  }
  const { protocol, host } = window.location;
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${host}/api/v1/events`;
}
