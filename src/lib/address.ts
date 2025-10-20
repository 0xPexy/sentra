export const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export function isEthAddress(value: string): value is `0x${string}` {
  return ETH_ADDRESS_REGEX.test(value.trim());
}
