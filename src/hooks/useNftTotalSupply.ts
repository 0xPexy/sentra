import { useCallback, useEffect, useRef, useState } from "react";
import { isEthAddress } from "../lib/address";
import { getPublicClient } from "../lib/viem";

const TOTAL_SUPPLY_ABI = [
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export function useNftTotalSupply(
  target: `0x${string}` | "",
  { onUpdate }: { onUpdate?: (supply: bigint) => void } = {}
) {
  const [supply, setSupply] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const lastFetchedTargetRef = useRef<`0x${string}` | "">("");

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const refresh = useCallback(async () => {
    if (!target || !isEthAddress(target)) {
      setSupply(null);
      setError(null);
      lastFetchedTargetRef.current = "";
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const result = (await getPublicClient().readContract({
        address: target,
        abi: TOTAL_SUPPLY_ABI,
        functionName: "totalSupply",
      })) as bigint;
      setSupply(result);
      onUpdateRef.current?.(result);
      lastFetchedTargetRef.current = target;
      return result;
    } catch (err) {
      console.error("Failed to load totalSupply", err);
      setError((err as Error).message ?? "failed to fetch totalSupply");
      setSupply(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => {
    if (!target || !isEthAddress(target)) {
      setSupply(null);
      lastFetchedTargetRef.current = "";
      return;
    }
    if (lastFetchedTargetRef.current === target && supply !== null) {
      return;
    }
    refresh();
  }, [target, refresh, supply]);

  return { supply, loading, error, refresh };
}
