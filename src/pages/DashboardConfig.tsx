import { useCallback, useEffect, useMemo, useState } from "react";
import type { ContractWL, PaymasterResponse } from "../lib/api";
import { ApiError, api } from "../lib/api";
import {
  ENTRYPOINT_ABI,
  fetchPaymasterDeposit,
  formatWeiToEth,
  getPublicClient,
  getWalletClient,
  parseEthAmountToValue,
} from "../lib/viem";
import { parseSelectorEntries } from "../lib/selectors";
import type { SelectorEntry } from "../lib/selectors";
import { useAuth } from "../state/auth";
import PageHeader from "../components/layout/PageHeader";
import { isEthAddress } from "../lib/address";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export default function DashboardConfig() {
  const { token } = useAuth();
  const [pm, setPm] = useState<PaymasterResponse | null>(null);
  const [depositWei, setDepositWei] = useState<bigint | null>(null);
  const [usdPerOp, setUsdPerOp] = useState<number | null>(null);
  const [contracts, setContracts] = useState<ContractWL[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const handleError = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) {
      return;
    }
    console.error(error);
  }, []);

  const handleSuccess = useCallback(() => undefined, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const paymaster = await api.getPaymaster(token);
      setPm(paymaster);
      const usdMax = paymaster.usdPerMaxOp ?? paymaster.usdcMaxPerOpUSD;
      setUsdPerOp(
        typeof usdMax === "number" && Number.isFinite(usdMax) ? usdMax : null
      );

      const [contractsResult, usersResult] = await Promise.allSettled([
        api.listContracts(token),
        api.listUsers(token),
      ]);

      if (contractsResult.status === "fulfilled") {
        setContracts(contractsResult.value);
      } else {
        handleError(contractsResult.reason);
        setContracts(paymaster.contracts ?? []);
      }

      if (usersResult.status === "fulfilled") {
        setUsers(
          usersResult.value
            .filter((entry) => typeof entry === "string")
            .map((entry: string) => entry.trim())
            .filter((entry) => entry.length > 0)
        );
      } else {
        handleError(usersResult.reason);
        setUsers([]);
      }

      if (
        paymaster.address &&
        paymaster.address !== ZERO_ADDRESS &&
        paymaster.entryPoint &&
        isEthAddress(paymaster.entryPoint) &&
        isEthAddress(paymaster.address)
      ) {
        const deposit = await fetchPaymasterDeposit(
          paymaster.entryPoint as `0x${string}`,
          paymaster.address as `0x${string}`
        );
        setDepositWei(deposit);
      } else {
        setDepositWei(null);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setPm(null);
        setUsdPerOp(null);
        setContracts([]);
        setUsers([]);
        setDepositWei(null);
      } else {
        handleError(error);
      }
    } finally {
      setLoading(false);
    }
  }, [handleError, token]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) return null;

  const isRegistered = useMemo(
    () => Boolean(pm?.address && pm.address !== ZERO_ADDRESS),
    [pm?.address]
  );

  return (
    <div className="space-y-8">
      <PageHeader title="Configuration" />
      {loading && (
        <div className="rounded-lg border border-slate-800 bg-[#0f1422] p-4 text-sm text-slate-400">
          Loading paymaster configuration…
        </div>
      )}

      <PaymasterCard
        pm={pm}
        depositWei={depositWei}
        usdPerOp={usdPerOp}
        onSaved={refresh}
        onError={handleError}
        onSuccess={handleSuccess}
      />

      <AllowlistCard
        contracts={contracts}
        onChange={refresh}
        onError={handleError}
        onSuccess={handleSuccess}
        disabled={!isRegistered}
      />

      <GasPolicyCard
        pm={pm}
        onSaved={refresh}
        onError={handleError}
        onSuccess={handleSuccess}
        disabled={!isRegistered}
      />

      <UserWhitelistCard
        users={users}
        onChange={refresh}
        onError={handleError}
        onSuccess={handleSuccess}
        disabled={!isRegistered}
      />
    </div>
  );
}

type FeedbackHandlers = {
  onSuccess: (message: string) => void;
  onError: (error: unknown) => void;
};

function PaymasterCard({
  pm,
  depositWei,
  usdPerOp,
  onSaved,
  onSuccess,
  onError,
}: {
  pm: PaymasterResponse | null;
  depositWei: bigint | null;
  usdPerOp: number | null;
  onSaved: () => void;
} & FeedbackHandlers) {
  const { token } = useAuth();
  const [addr, setAddr] = useState(pm?.address ?? "");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(
    !pm?.address || pm.address === ZERO_ADDRESS
  );

  const addressValid = useMemo(
    () => (addr.trim() === "" ? false : isEthAddress(addr)),
    [addr]
  );

  useEffect(() => {
    setAddr(pm?.address ?? "");
    setEditing(!pm?.address || pm.address === ZERO_ADDRESS);
  }, [pm?.address]);

  const unregistered = useMemo(
    () => !pm?.address || pm.address === ZERO_ADDRESS,
    [pm]
  );

  const entryPointValid = useMemo(
    () => (pm?.entryPoint ? isEthAddress(pm.entryPoint) : false),
    [pm?.entryPoint]
  );

  const formattedDeposit = useMemo(() => {
    if (depositWei === null) return "-";
    try {
      const weiString = formatWeiToEth(depositWei);
      if (!weiString) return "-";
      const [integer, rawFraction = ""] = weiString.split(".");
      const fraction = rawFraction.padEnd(3, "0").slice(0, 3);
      const trimmed = fraction.replace(/0+$/, "");
      return trimmed.length > 0 ? `${integer}.${trimmed}` : integer;
    } catch {
      return "-";
    }
  }, [depositWei]);

  const formattedUsdLimit = useMemo(() => {
    if (usdPerOp === null || Number.isNaN(usdPerOp)) return "-";
    return usdPerOp.toFixed(2);
  }, [usdPerOp]);

  const save = async () => {
    if (!token || !addressValid) return;
    setSaving(true);
    try {
      if (unregistered) {
        await api.createPaymaster(token, {
          address: addr,
          usdPerMaxOp: usdPerOp ?? undefined,
        });
      } else {
        await api.updatePaymaster(token, {
          address: addr,
          usdPerMaxOp: usdPerOp ?? undefined,
        });
      }
      onSuccess("Paymaster address saved");
      onSaved();
      setEditing(false);
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  const deposit = async () => {
    if (!pm?.address || !isEthAddress(pm.address)) {
      onError(new Error("Set Paymaster address first"));
      return;
    }
    if (!pm.entryPoint || !entryPointValid) {
      onError(new Error("Configure a valid EntryPoint address"));
      return;
    }
    const amount = window.prompt("Deposit amount in ETH (e.g. 0.05)");
    if (!amount) return;
    try {
      const value = parseEthAmountToValue(amount);
      const wallet = await getWalletClient();
      let account = (await wallet.getAddresses())[0];
      if (!account && wallet.requestAddresses) {
        const requested = await wallet.requestAddresses();
        account = requested?.[0];
      }
      if (!account) {
        throw new Error("Connect your wallet before depositing");
      }
      const hash = await wallet.writeContract({
        account,
        chain: null,
        address: pm.entryPoint as `0x${string}`,
        abi: ENTRYPOINT_ABI,
        functionName: "depositTo",
        args: [pm.address as `0x${string}`],
        value,
      });
      onSuccess(`Transaction submitted: ${hash}`);
      await getPublicClient().waitForTransactionReceipt({ hash });
      onSuccess("Deposit confirmed on-chain");
      window.dispatchEvent(new CustomEvent("sentra:wallet-refresh"));
      onSaved();
    } catch (error) {
      onError(error);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-[#151A28] p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Paymaster</h3>
        <span
          className={`rounded px-2 py-1 text-xs ${
            unregistered
              ? "bg-red-900/40 text-red-300"
              : "bg-emerald-900/30 text-emerald-300"
          }`}
        >
          {unregistered ? "Unregistered" : "Registered"}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2 space-y-2">
          <div>
            <label className="mb-1 block text-sm text-slate-400">
              Paymaster Contract Address
            </label>
            {editing ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className={`w-full flex-1 rounded border px-3 py-2 font-mono outline-none ${
                    addressValid
                      ? "border-slate-700 bg-slate-900"
                      : "border-red-500/60 bg-red-500/10"
                  }`}
                  value={addr}
                  onChange={(e) => setAddr(e.target.value)}
                  placeholder="0x..."
                />
                <button
                  onClick={save}
                  disabled={saving || !addressValid}
                  className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                {!unregistered && (
                  <button
                    onClick={() => {
                      setAddr(pm?.address ?? "");
                      setEditing(false);
                    }}
                    className="rounded border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-slate-200">
                  {pm?.address}
                </span>
                <button
                  onClick={() => setEditing(true)}
                  className="rounded border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800"
                >
                  Edit
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">
              Entry Point Address
            </label>
            <div className="font-mono text-sm text-slate-200">
              {entryPointValid ? pm?.entryPoint : "-"}
            </div>
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-400">
          Deposit (ETH)
        </label>
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg font-semibold">
            {formattedDeposit}
          </span>
          <button
            onClick={deposit}
            className="h-9 rounded bg-slate-800 px-4 text-sm font-medium hover:bg-slate-700"
          >
            Add Deposit
          </button>
        </div>
      </div>
    </section>
  );
}

function AllowlistCard({
  contracts,
  onChange,
  onSuccess,
  onError,
  disabled,
}: {
  contracts: ContractWL[];
  onChange: () => Promise<void> | void;
  disabled: boolean;
} & FeedbackHandlers) {
  const { token } = useAuth();
  const [addr, setAddr] = useState("");
  const [name, setName] = useState("");
  const [newFunctionsCsv, setNewFunctionsCsv] = useState("");

  const contractAddressValid = useMemo(
    () => (addr.trim() === "" ? false : isEthAddress(addr)),
    [addr]
  );

  const {
    selectors: newContractFunctions,
    selectorError: newContractSelectorError,
  } = useMemo(() => {
    if (!newFunctionsCsv.trim()) {
      return {
        selectors: [] as SelectorEntry[],
        selectorError: null as string | null,
      };
    }
    try {
      return {
        selectors: parseSelectorEntries(newFunctionsCsv),
        selectorError: null,
      };
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Invalid selector input";
      return { selectors: [] as SelectorEntry[], selectorError: msg };
    }
  }, [newFunctionsCsv]);

  const resetNewContractForm = () => {
    setAddr("");
    setName("");
    setNewFunctionsCsv("");
  };

  const addContract = async () => {
    if (
      !token ||
      !addr.trim() ||
      disabled ||
      !contractAddressValid ||
      newContractSelectorError
    )
      return;
    try {
      await api.addContract(token, {
        address: addr.trim(),
        name: name.trim() || undefined,
        functions: newContractFunctions,
      });
      onSuccess("Contract added to allowlist");
      resetNewContractForm();
      await Promise.resolve(onChange());
    } catch (error) {
      onError(error);
    }
  };

  const delContract = async (id: number) => {
    if (!token || disabled) return;
    try {
      await api.deleteContract(token, id);
      onSuccess("Contract removed from allowlist");
      await Promise.resolve(onChange());
    } catch (error) {
      onError(error);
    }
  };

  const editFunctions = async (contract: ContractWL) => {
    if (!token || disabled) return;
    const current = (contract.functions ?? [])
      .map((fn) => fn.signature ?? fn.selector)
      .join(", ");
    const next =
      window.prompt(
        "Comma separated function signatures or selectors",
        current
      ) ?? undefined;
    if (next === undefined) return;
    const trimmed = next.trim();
    try {
      const entries = trimmed ? parseSelectorEntries(trimmed) : [];
      await api.updateContract(token, contract.id, {
        name: contract.name ?? undefined,
        functions: entries,
      });
      onSuccess("Contract functions updated");
      await Promise.resolve(onChange());
    } catch (error) {
      onError(error);
    }
  };

  return (
    <section className="space-y-6 rounded-xl border border-slate-800 bg-[#151A28] p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Contract allowlist</h3>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2.5fr)_minmax(0,1fr)]">
        <div>
          <label className="mb-1 block text-sm text-slate-400">
            Contract Address
          </label>
          <input
            className={`h-11 w-full rounded border px-3 font-mono text-sm outline-none ${
              contractAddressValid || addr.trim() === ""
                ? "border-slate-700 bg-slate-900"
                : "border-red-500/60 bg-red-500/10"
            }`}
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="0x..."
            disabled={disabled}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-400">
            Name (optional)
          </label>
          <input
            className="h-11 w-full rounded border border-slate-700 bg-slate-900 px-3 text-sm outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. NFT"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-400">
            Functions (optional, comma separated)
          </label>
          <input
            className={`h-11 w-full rounded border px-3 font-mono text-sm outline-none ${
              !newFunctionsCsv || !newContractSelectorError
                ? "border-slate-700 bg-slate-900"
                : "border-red-500/60 bg-red-500/10"
            }`}
            value={newFunctionsCsv}
            onChange={(e) => setNewFunctionsCsv(e.target.value)}
            placeholder="mint(),transfer(address,uint256)"
            disabled={disabled}
          />
          {newContractSelectorError && (
            <div className="mt-2 text-xs text-red-300">
              {newContractSelectorError}
            </div>
          )}
        </div>
        <div className="flex items-end">
          <button
            onClick={addContract}
            className="h-11 w-full rounded bg-indigo-600 px-3 text-sm font-medium hover:bg-indigo-500 disabled:opacity-60"
            disabled={
              disabled ||
              !contractAddressValid ||
              Boolean(newContractSelectorError)
            }
          >
            Add
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#0f1422]">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium w-[120px]">Name</th>
              <th className="px-3 py-2 font-medium w-[360px]">Address</th>
              <th className="px-3 py-2 font-medium">Functions</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((contract) => {
              const functions = contract.functions ?? [];
              return (
                <tr key={contract.id} className="border-t border-slate-800">
                  <td
                    className="px-3 py-2 align-top max-w-[120px] truncate"
                    title={contract.name ?? "-"}
                  >
                    {contract.name || "-"}
                  </td>
                  <td
                    className="px-3 py-2 font-mono align-top max-w-[360px] truncate"
                    title={contract.address}
                  >
                    {contract.address}
                  </td>
                  <td className="px-3 py-2">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {functions.length > 0 ? (
                          functions.map((fn) => (
                            <span
                              key={`${contract.id}-${fn.selector}`}
                              className="rounded bg-slate-800 px-2 py-1 font-mono text-xs text-slate-200"
                            >
                              {fn.signature ?? fn.selector}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-500">
                            No functions
                          </span>
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => editFunctions(contract)}
                          className="rounded border border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-800 disabled:opacity-60"
                          disabled={disabled}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => delContract(contract.id)}
                          className="rounded bg-red-900/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-900/60 disabled:opacity-60"
                          disabled={disabled}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
            {contracts.length === 0 && (
              <tr>
                <td colSpan={3} className="p-3 text-slate-400">
                  No contracts
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function GasPolicyCard({
  pm,
  onSaved,
  onSuccess,
  onError,
  disabled,
}: {
  pm: PaymasterResponse | null;
  onSaved: () => void;
  disabled: boolean;
} & FeedbackHandlers) {
  const { token } = useAuth();
  const [usd, setUsd] = useState<number>(
    pm?.usdPerMaxOp ?? pm?.usdcMaxPerOpUSD ?? 0
  );
  const [saving, setSaving] = useState(false);

  const isUsdValid = useMemo(() => Number.isFinite(usd) && usd >= 0, [usd]);

  useEffect(() => {
    setUsd(pm?.usdPerMaxOp ?? pm?.usdcMaxPerOpUSD ?? 0);
  }, [pm?.usdPerMaxOp, pm?.usdcMaxPerOpUSD]);

  const save = async () => {
    if (!token || disabled || !isUsdValid) return;
    setSaving(true);
    try {
      await api.updatePaymaster(token, {
        address: pm?.address,
        usdPerMaxOp: usd,
      });
      onSuccess("Gas policy updated");
      onSaved();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-[#151A28] p-4">
      <h3 className="font-semibold">Gas policy</h3>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <div>
          <div className="mb-1 text-sm text-slate-400">
            Max sponsored per operation (USD)
          </div>
          <input
            type="number"
            className={`w-40 rounded border px-3 py-2 outline-none ${
              isUsdValid
                ? "border-slate-700 bg-slate-900"
                : "border-red-500/60 bg-red-500/10"
            }`}
            value={usd}
            onChange={(e) => setUsd(Number(e.target.value))}
            disabled={disabled}
          />
        </div>
        <button
          onClick={save}
          disabled={saving || disabled || !isUsdValid}
          className="h-10 rounded bg-indigo-600 px-4 text-sm font-medium hover:bg-indigo-500 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="text-xs text-slate-400">
        * Conversion follows backend oracle logic (e.g. Chainlink).
      </p>
    </section>
  );
}

function UserWhitelistCard({
  users,
  onChange,
  onSuccess,
  onError,
  disabled,
}: {
  users: string[];
  onChange: () => void;
  disabled: boolean;
} & FeedbackHandlers) {
  const { token } = useAuth();
  const [sender, setSender] = useState("");
  const senderValid = useMemo(
    () => (sender.trim() === "" ? false : isEthAddress(sender)),
    [sender]
  );

  const add = async () => {
    if (!token || !sender.trim() || disabled || !senderValid) return;
    try {
      const trimmed = sender.trim();
      const lower = trimmed.toLowerCase();
      if (users.some((value) => value.toLowerCase() === lower)) {
        onError(new Error("Address already whitelisted"));
        return;
      }
      await api.addUser(token, trimmed);
      onSuccess("User added to sponsor whitelist");
      setSender("");
      onChange();
    } catch (error) {
      onError(error);
    }
  };

  const remove = async (target: string) => {
    if (!token || disabled) return;
    try {
      const normalized = target.trim();
      await api.deleteUser(token, normalized);
      onSuccess("User removed from sponsor whitelist");
      onChange();
    } catch (error) {
      onError(error);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-[#151A28] p-4">
      <h3 className="font-semibold">Allowed accounts</h3>

      <div className="flex items-center gap-2 max-w-xl">
        <input
          className={`flex-1 rounded border px-3 py-2 font-mono outline-none ${
            senderValid || sender.trim() === ""
              ? "border-slate-700 bg-slate-900"
              : "border-red-500/60 bg-red-500/10"
          }`}
          placeholder="0x..."
          value={sender}
          onChange={(e) => setSender(e.target.value)}
        />
        <button
          onClick={add}
          className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-60"
          disabled={disabled || !senderValid}
        >
          Add
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#0f1422]">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="p-3 font-medium">Account</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user} className="border-t border-slate-800">
                <td className="p-3 font-mono max-w-[280px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{user}</span>
                    <button
                      onClick={() => remove(user)}
                      className="rounded bg-red-900/40 px-2 py-1 text-[11px] font-medium text-red-200 hover:bg-red-900/60 disabled:opacity-60"
                      disabled={disabled}
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td className="p-3 text-slate-400">No users</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
