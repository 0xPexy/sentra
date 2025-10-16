import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import type { ContractWL, FunctionWL, Paymaster, UserWL } from "../lib/api";
import { ENTRYPOINT, ENTRYPOINT_ABI, getWalletClient, parseEthAmountToValue, publicClient } from "../lib/viem";
import { parseSelectorsList } from "../lib/selectors";
import { useAuth } from "../state/auth";

const PM_ID = 1; // TODO: wire up dynamic selection if multiple paymasters are supported

type Toast = { type: "success" | "error"; message: string };

export default function DashboardConfig() {
  const { token } = useAuth();
  const [pm, setPm] = useState<Paymaster | null>(null);
  const [depositWei, setDepositWei] = useState<string>("-");
  const [contracts, setContracts] = useState<ContractWL[]>([]);
  const [funcs, setFuncs] = useState<FunctionWL[]>([]);
  const [users, setUsers] = useState<UserWL[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimeout = useRef<number | undefined>(undefined);

  const showToast = useCallback((type: Toast["type"], message: string) => {
    if (toastTimeout.current) {
      window.clearTimeout(toastTimeout.current);
    }
    setToast({ type, message });
    toastTimeout.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  const getErrorMessage = useCallback((error: unknown) => {
    if (error instanceof Error) {
      try {
        const parsed = JSON.parse(error.message);
        if (typeof parsed === "string") return parsed;
        if (parsed && typeof parsed === "object" && "message" in parsed) {
          return String((parsed as { message?: unknown }).message ?? error.message);
        }
      } catch {
        // noop – fall back to error.message below
      }
      return error.message;
    }
    return "Unexpected error occurred";
  }, []);

  const handleError = useCallback(
    (error: unknown) => {
      console.error(error);
      showToast("error", getErrorMessage(error));
    },
    [getErrorMessage, showToast],
  );

  const handleSuccess = useCallback(
    (message: string) => {
      showToast("success", message);
    },
    [showToast],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [paymaster, bal, cs, fs, us] = await Promise.all([
        api.getPaymaster(token, PM_ID),
        api.getDeposit(token, PM_ID),
        api.listContracts(token, PM_ID),
        api.listFunctions(token, PM_ID),
        api.listUsers(token, PM_ID),
      ]);
      setPm(paymaster);
      setDepositWei(bal.depositWei);
      setContracts(cs);
      setFuncs(fs);
      setUsers(us);
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  }, [handleError, token]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(
    () => () => {
      if (toastTimeout.current) {
        window.clearTimeout(toastTimeout.current);
      }
    },
    [],
  );

  if (!token) return null;

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold">Configuration</h2>
      {toast && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            toast.type === "error"
              ? "border-red-500/40 bg-red-500/10 text-red-300"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {toast.message}
        </div>
      )}
      {loading && (
        <div className="rounded-lg border border-slate-800 bg-[#0f1422] p-4 text-sm text-slate-400">
          Loading paymaster configuration…
        </div>
      )}

      <PaymasterCard
        pm={pm}
        depositWei={depositWei}
        onSaved={refresh}
        onError={handleError}
        onSuccess={handleSuccess}
      />

      <AllowlistCard
        contracts={contracts}
        funcs={funcs}
        onChange={refresh}
        onError={handleError}
        onSuccess={handleSuccess}
      />

      <GasPolicyCard pm={pm} onSaved={refresh} onError={handleError} onSuccess={handleSuccess} />

      <UserWhitelistCard users={users} onChange={refresh} onError={handleError} onSuccess={handleSuccess} />
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
  onSaved,
  onSuccess,
  onError,
}: {
  pm: Paymaster | null;
  depositWei: string;
  onSaved: () => void;
} & FeedbackHandlers) {
  const { token } = useAuth();
  const [addr, setAddr] = useState(pm?.address ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => setAddr(pm?.address ?? ""), [pm?.address]);

  const unregistered = useMemo(
    () => !pm?.address || pm.address === "0x0000000000000000000000000000000000000000",
    [pm],
  );

  const save = async () => {
    if (!token || !pm) return;
    setSaving(true);
    try {
      await api.updatePaymaster(token, pm.id, { address: addr });
      onSuccess("Paymaster address saved");
      onSaved();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  const deposit = async () => {
    if (!pm?.address) {
      onError(new Error("Set Paymaster address first"));
      return;
    }
    const amount = window.prompt("Deposit amount in ETH (e.g. 0.05)");
    if (!amount) return;
    try {
      const value = parseEthAmountToValue(amount);
      const wallet = getWalletClient();
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
        address: ENTRYPOINT,
        abi: ENTRYPOINT_ABI,
        functionName: "depositTo",
        args: [pm.address as `0x${string}`],
        value,
      });
      onSuccess(`Transaction submitted: ${hash}`);
      await publicClient.waitForTransactionReceipt({ hash });
      onSuccess("Deposit confirmed on-chain");
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
            unregistered ? "bg-red-900/40 text-red-300" : "bg-emerald-900/30 text-emerald-300"
          }`}
        >
          {unregistered ? "Unregistered" : "Registered"}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm text-slate-400">Paymaster Contract Address</label>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono outline-none"
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="0x..."
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="grid items-end gap-3 md:grid-cols-3">
        <div>
          <div className="mb-1 text-sm text-slate-400">Deposit (wei)</div>
          <div className="font-mono text-2xl font-semibold">{depositWei}</div>
        </div>
        <div className="md:col-span-2 flex justify-end gap-2">
          <button
            onClick={deposit}
            className="rounded bg-slate-800 px-3 py-2 text-sm font-medium hover:bg-slate-700"
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
  funcs,
  onChange,
  onSuccess,
  onError,
}: {
  contracts: ContractWL[];
  funcs: FunctionWL[];
  onChange: () => void;
} & FeedbackHandlers) {
  const { token } = useAuth();
  const [addr, setAddr] = useState("");
  const [label, setLabel] = useState("");
  const [selCsv, setSelCsv] = useState("");
  const [selContractId, setSelContractId] = useState<number | "">("");
  const [subsidyBps, setSubsidyBps] = useState(10000);
  const [allow, setAllow] = useState(true);

  const { selectors, selectorError } = useMemo(() => {
    if (!selCsv.trim()) return { selectors: [] as `0x${string}`[], selectorError: null as string | null };
    try {
      return { selectors: parseSelectorsList(selCsv), selectorError: null };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Invalid selector input";
      return { selectors: [] as `0x${string}`[], selectorError: msg };
    }
  }, [selCsv]);

  const contractLookup = useMemo(() => {
    const map = new Map<number, ContractWL>();
    contracts.forEach((c) => map.set(c.id, c));
    return map;
  }, [contracts]);

  const addContract = async () => {
    if (!token || !addr.trim()) return;
    try {
      await api.addContract(token, PM_ID, addr.trim(), label.trim() || undefined);
      onSuccess("Contract added to allowlist");
      setAddr("");
      setLabel("");
      onChange();
    } catch (error) {
      onError(error);
    }
  };

  const delContract = async (id: number) => {
    if (!token) return;
    try {
      await api.deleteContract(token, PM_ID, id);
      onSuccess("Contract removed from allowlist");
      if (selContractId === id) setSelContractId("");
      onChange();
    } catch (error) {
      onError(error);
    }
  };

  const addFunctions = async () => {
    if (!token || !selContractId) {
      onError(new Error("Select a target contract first"));
      return;
    }
    if (selectorError) {
      onError(new Error(selectorError));
      return;
    }
    if (selectors.length === 0) {
      onError(new Error("Enter at least one function signature or selector"));
      return;
    }
    try {
      await Promise.all(
        selectors.map((selector) =>
          api.addFunction(token, PM_ID, selContractId, selector, allow, subsidyBps),
        ),
      );
      onSuccess(`Added ${selectors.length} function${selectors.length > 1 ? "s" : ""}`);
      setSelCsv("");
      onChange();
    } catch (error) {
      onError(error);
    }
  };

  const delFunction = async (id: number) => {
    if (!token) return;
    try {
      await api.deleteFunction(token, PM_ID, id);
      onSuccess("Function removed from allowlist");
      onChange();
    } catch (error) {
      onError(error);
    }
  };

  return (
    <section className="space-y-6 rounded-xl border border-slate-800 bg-[#151A28] p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Contract allowlist</h3>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm text-slate-400">Contract Address</label>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono outline-none"
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="0x..."
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-400">Name (optional)</label>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 outline-none"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. NFT Minter"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={addContract}
            className="w-full rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500"
          >
            Add
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#0f1422]">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Address</th>
              <th className="p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((contract) => (
              <tr key={contract.id} className="border-t border-slate-800">
                <td className="p-3">{contract.label || "-"}</td>
                <td className="p-3 font-mono">{contract.address}</td>
                <td className="p-3">
                  <button
                    onClick={() => delContract(contract.id)}
                    className="rounded bg-red-900/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-900/60"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
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

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm text-slate-400">Target Contract</label>
          <select
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 outline-none"
            value={selContractId}
            onChange={(e) => setSelContractId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Select contract</option>
            {contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.label || `${contract.address.slice(0, 10)}…`}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm text-slate-400">Functions (comma or newline separated)</label>
          <textarea
            className="h-24 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono outline-none"
            value={selCsv}
            onChange={(e) => setSelCsv(e.target.value)}
            placeholder="mint()\nmintTo(address,uint256)\n0x449a52f8"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            {selectors.length > 0 && (
              <span>
                Preview selectors:
                <span className="ml-2 inline-flex flex-wrap gap-2">
                  {selectors.map((selector) => (
                    <span key={selector} className="rounded bg-slate-800 px-2 py-1 font-mono text-slate-200">
                      {selector}
                    </span>
                  ))}
                </span>
              </span>
            )}
            {selectorError && <span className="text-red-300">{selectorError}</span>}
            <label className="ml-auto inline-flex items-center gap-2">
              <input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} />
              Allow
            </label>
            <label className="inline-flex items-center gap-2">
              Subsidy Bps
              <input
                type="number"
                className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right outline-none"
                value={subsidyBps}
                onChange={(e) => setSubsidyBps(Number(e.target.value))}
              />
            </label>
            <button
              onClick={addFunctions}
              className="ml-auto rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500"
            >
              Add Functions
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#0f1422]">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="p-3 font-medium">Contract</th>
              <th className="p-3 font-medium">Selector</th>
              <th className="p-3 font-medium">Allow</th>
              <th className="p-3 font-medium">Subsidy (bps)</th>
              <th className="p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {funcs.map((fn) => {
              const contract = contractLookup.get(fn.contractId);
              return (
                <tr key={fn.id} className="border-t border-slate-800">
                  <td className="p-3">
                    {contract?.label || contract?.address || "-"}
                  </td>
                  <td className="p-3 font-mono">{fn.selector}</td>
                  <td className="p-3">{fn.allow ? "Allow" : "Block"}</td>
                  <td className="p-3">{fn.subsidyBps}</td>
                  <td className="p-3">
                    <button
                      onClick={() => delFunction(fn.id)}
                      className="rounded bg-red-900/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-900/60"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {funcs.length === 0 && (
              <tr>
                <td colSpan={5} className="p-3 text-slate-400">
                  No functions
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
}: {
  pm: Paymaster | null;
  onSaved: () => void;
} & FeedbackHandlers) {
  const { token } = useAuth();
  const [usd, setUsd] = useState<number>(pm?.usdcMaxPerOpUSD ?? 0);
  const [saving, setSaving] = useState(false);

  useEffect(() => setUsd(pm?.usdcMaxPerOpUSD ?? 0), [pm?.usdcMaxPerOpUSD]);

  const save = async () => {
    if (!token || !pm) return;
    setSaving(true);
    try {
      await api.updatePaymaster(token, pm.id, { usdcMaxPerOpUSD: usd });
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="mb-1 text-sm text-slate-400">Max sponsored per operation (USDC)</div>
          <input
            type="number"
            className="w-40 rounded border border-slate-700 bg-slate-900 px-3 py-2 outline-none"
            value={usd}
            onChange={(e) => setUsd(Number(e.target.value))}
          />
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="text-xs text-slate-400">* Conversion follows backend oracle logic (e.g. Chainlink).</p>
    </section>
  );
}

function UserWhitelistCard({
  users,
  onChange,
  onSuccess,
  onError,
}: {
  users: UserWL[];
  onChange: () => void;
} & FeedbackHandlers) {
  const { token } = useAuth();
  const [sender, setSender] = useState("");

  const add = async () => {
    if (!token || !sender.trim()) return;
    try {
      await api.addUser(token, PM_ID, sender.trim());
      onSuccess("User added to sponsor whitelist");
      setSender("");
      onChange();
    } catch (error) {
      onError(error);
    }
  };

  const del = async (id: number) => {
    if (!token) return;
    try {
      await api.deleteUser(token, PM_ID, id);
      onSuccess("User removed from sponsor whitelist");
      onChange();
    } catch (error) {
      onError(error);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-[#151A28] p-4">
      <h3 className="font-semibold">Allowed users</h3>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono outline-none"
          placeholder="0xSender..."
          value={sender}
          onChange={(e) => setSender(e.target.value)}
        />
        <button
          onClick={add}
          className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500"
        >
          Add
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#0f1422]">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="p-3 font-medium">Sender</th>
              <th className="p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-slate-800">
                <td className="p-3 font-mono">{user.sender}</td>
                <td className="p-3">
                  <button
                    onClick={() => del(user.id)}
                    className="rounded bg-red-900/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-900/60"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={2} className="p-3 text-slate-400">
                  No users
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
