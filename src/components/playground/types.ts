import type { PaymasterResponse } from "../../lib/api";

export type DeployResult = {
  address: `0x${string}`;
  minter: `0x${string}` | "";
};

export type StoredState = {
  name?: string;
  symbol?: string;
  defaultAdmin?: `0x${string}` | "";
  minter?: `0x${string}` | "";
  lastDeploy?: DeployResult | null;
  paymasterAddress?: `0x${string}` | "";
  paymasterEntryPoint?: `0x${string}` | "";
  paymasterPolicySigner?: `0x${string}` | "";
  simpleAccount?: `0x${string}` | "";
  simpleAccountOwner?: `0x${string}` | "";
  simpleAccountFactory?: `0x${string}` | "";
  lastSalt?: string;
};

export type SimpleAccountAddressResult = {
  address: `0x${string}`;
  owner: `0x${string}`;
  salt: bigint;
  factory: `0x${string}`;
};

export type PaymasterInfo = PaymasterResponse | null;
