import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeFunctionData } from "viem";
import { isEthAddress } from "../../lib/address";
import { api } from "../../lib/api";
import {
  SIMPLE_ACCOUNT_FACTORY_ABI,
  buildFactoryData,
} from "../../lib/userOpLegacy";
import { getPublicClient, getWalletClient } from "../../lib/viem";
import type {
  SimpleAccountAddressResult,
  StoredState,
} from "./types";

type Props = {
  storedState: StoredState;
  updateStoredState: (patch: Partial<StoredState>) => void;
  suggestedEntryPoint?: `0x${string}` | "";
  onCalculated: (result: SimpleAccountAddressResult) => void;
  authToken?: string | null;
};

export function CalculateSimpleAccountCard({
  storedState,
  updateStoredState,
  suggestedEntryPoint = "",
  onCalculated,
  authToken,
}: Props) {
  const [factoryAddress, setFactoryAddress] = useState<`0x${string}` | "">(
    storedState.simpleAccountFactory ?? ""
  );
  const [entryPoint, setEntryPoint] = useState<`0x${string}` | "">(
    storedState.paymasterEntryPoint ?? suggestedEntryPoint ?? ""
  );
  const [owner, setOwner] = useState<`0x${string}` | "">(
    storedState.simpleAccountOwner ?? ""
  );
  const [salt, setSalt] = useState<string>(storedState.lastSalt ?? "0");
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [calculatedAddress, setCalculatedAddress] = useState<
    `0x${string}` | ""
  >(storedState.simpleAccount ?? "");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api.getContractAddress(
          "simple_account_factory",
          authToken
        );
        if (cancelled) return;
        if (result?.address) {
          const normalized = result.address as `0x${string}`;
          setFactoryAddress((prev) => prev || normalized);
          if (storedState.simpleAccountFactory !== normalized) {
            updateStoredState({ simpleAccountFactory: normalized });
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setStatus((prev) =>
            prev
              ? `${prev}\nFailed to load SimpleAccount factory address.`
              : "Failed to load SimpleAccount factory address."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken, storedState.simpleAccountFactory, updateStoredState]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api.getEntryPointAddress(authToken);
        if (cancelled) return;
        if (result?.address) {
          const normalized = result.address as `0x${string}`;
          setEntryPoint((prev) => prev || normalized);
          if (storedState.paymasterEntryPoint !== normalized) {
            updateStoredState({ paymasterEntryPoint: normalized });
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setStatus((prev) =>
            prev
              ? `${prev}\nFailed to load EntryPoint address.`
              : "Failed to load EntryPoint address."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken, storedState.paymasterEntryPoint, updateStoredState]);

  useEffect(() => {
    if (!suggestedEntryPoint) {
      return;
    }
    setEntryPoint((prev) => prev || suggestedEntryPoint);
  }, [suggestedEntryPoint]);

  useEffect(() => {
    if (owner) return;
    (async () => {
      try {
        const wallet = await getWalletClient();
        const addresses = await wallet.getAddresses();
        if (addresses?.[0]) {
          const first = addresses[0] as `0x${string}`;
          setOwner(first);
          updateStoredState({ simpleAccountOwner: first });
        }
      } catch {
        /* ignore */
      }
    })();
  }, [owner, updateStoredState]);

  const handleOwnerChange = useCallback(
    (value: string) => {
      setOwner(value as `0x${string}` | "");
      updateStoredState({ simpleAccountOwner: value as `0x${string}` });
    },
    [updateStoredState]
  );

  const handleSaltChange = useCallback(
    (value: string) => {
      setSalt(value);
      updateStoredState({ lastSalt: value });
    },
    [updateStoredState]
  );

  const formattedFactory = useMemo(
    () => (factoryAddress ? factoryAddress : "-"),
    [factoryAddress]
  );
  const formattedEntryPoint = useMemo(
    () => (entryPoint ? entryPoint : "-"),
    [entryPoint]
  );

  const calculate = useCallback(async () => {
    if (!factoryAddress || !isEthAddress(factoryAddress)) {
      setStatus("Failed: confirm SimpleAccount factory address.");
      return;
    }
    if (!owner || !isEthAddress(owner)) {
      setStatus("Failed: provide a valid owner address.");
      return;
    }
    let saltValue: bigint;
    try {
      saltValue = BigInt(salt || "0");
    } catch {
      setStatus("Failed: salt must be an integer.");
      return;
    }
    setLoading(true);
    setStatus("Preparing factory call…");
    try {
      setStatus((prev) =>
        prev ? `${prev}\nEstimating SimpleAccount address…` : "Estimating SimpleAccount address…"
      );
      const predicted = (await getPublicClient().readContract({
        address: factoryAddress as `0x${string}`,
        abi: SIMPLE_ACCOUNT_FACTORY_ABI,
        functionName: "getAddress",
        args: [owner as `0x${string}`, saltValue],
      })) as `0x${string}`;

      setCalculatedAddress(predicted);
      setStatus(
        `Calculated ✅\nAddress: ${predicted}\nReady to use as sender/minter.`
      );
      updateStoredState({
        simpleAccount: predicted,
        simpleAccountFactory: factoryAddress as `0x${string}`,
        simpleAccountOwner: owner as `0x${string}`,
        lastSalt: salt,
        minter: predicted,
      });
      onCalculated({
        address: predicted,
        owner: owner as `0x${string}`,
        salt: saltValue,
        factory: factoryAddress as `0x${string}`,
      });
    } catch (error) {
      setStatus(
        `Failed to calculate SimpleAccount address: ${(error as Error).message}`
      );
    } finally {
      setLoading(false);
    }
  }, [
    factoryAddress,
    owner,
    salt,
    updateStoredState,
    onCalculated,
  ]);

  return (
    <section className="surface-card space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">SimpleAccount Address</h3>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-sm text-slate-400">Owner</div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
            value={owner}
            placeholder="0xOwner..."
            onChange={(event) => handleOwnerChange(event.target.value)}
          />
        </div>
        <div>
          <div className="mb-1 text-sm text-slate-400">Salt</div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
            value={salt}
            onChange={(event) => handleSaltChange(event.target.value)}
          />
        </div>
        <div>
          <div className="mb-1 text-sm text-slate-400">Entry Point</div>
          <div className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono">
            {formattedEntryPoint}
          </div>
        </div>
        <div>
          <div className="mb-1 text-sm text-slate-400">SimpleAccountFactory</div>
          <div className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono">
            {formattedFactory}
          </div>
        </div>
        <div className="md:col-span-2">
          <div className="mb-1 text-sm text-slate-400">Calculated Address</div>
          <div className="font-mono text-sm text-slate-200">
            {calculatedAddress || "-"}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={calculate}
          disabled={loading}
          className="btn-primary"
        >
          {loading ? "Calculating…" : "Calculate"}
        </button>
      </div>

      {status && (
        <div className="surface-card surface-card--muted p-3 text-xs text-slate-200">
          <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
            SimpleAccount Resolution
          </div>
          <ol className="space-y-2">
            {status
              .split("\n")
              .map((line) => line.trim())
              .filter((line) => line.length > 0)
              .map((line, index, all) => {
                const lower = line.toLowerCase();
                const isError =
                  lower.startsWith("failed") ||
                  lower.includes("unable") ||
                  lower.includes("error");
                const isDone =
                  lower.includes("calculated") || lower.includes("ready");
                const isActive =
                  !isError && !isDone && index === all.length - 1;
                const dotClass = isError
                  ? "bg-rose-500"
                  : isDone
                  ? "bg-emerald-500"
                  : isActive
                  ? "bg-emerald-300"
                  : "bg-slate-600";
                const textClass = isError
                  ? "text-rose-300"
                  : isDone
                  ? "text-emerald-300"
                  : "text-slate-200";
                return (
                  <li key={`${line}-${index}`} className="flex items-start gap-3">
                    <div className="mt-[3px] flex flex-col items-center">
                      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                      {index < all.length - 1 && (
                        <span className="mt-1 h-4 w-px bg-slate-700" />
                      )}
                    </div>
                    <span className={textClass}>{line}</span>
                  </li>
                );
              })}
          </ol>
        </div>
      )}
    </section>
  );
}
