import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import PageHeader from "../components/layout/PageHeader";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

type AssetMovement = {
  address?: string;
  token?: string;
  tokenId?: string;
  delta?: string;
};

type GasBreakdownRow = {
  from?: string;
  to?: string;
  gas?: string;
  gasUsed?: string;
  method?: string;
  stage?: string;
  type?: string;
};

type OperationDetail = {
  actualGasCost?: string;
  actualGasUsed?: string;
  assetMovements?: AssetMovement[];
  beneficiary?: string;
  blockNumber?: number;
  blockTime?: string;
  callGasLimit?: string;
  events?: Array<{
    blockNumber?: number;
    name?: string;
    txHash?: string;
  }>;
  gasBreakdown?: GasBreakdownRow[];
  logIndex?: number;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
  paymaster?: string;
  paymasterPostOpGasLimit?: string;
  paymasterVerificationGasLimit?: string;
  preVerificationGas?: string;
  revert?: {
    message?: string;
    raw?: string;
    selector?: string;
  };
  revertReason?: string;
  selector?: string;
  sender?: string;
  sponsorship?: {
    validAfter?: string;
    validUntil?: string;
  };
  status?: string;
  target?: string;
  txHash?: string;
  userOpHash?: string;
  verificationGasLimit?: string;
};

type GasPhase = {
  phase: string;
  gasUsed?: string;
  gasLimit?: string;
};

type GasResponse = {
  actualGasCost?: string;
  actualGasUsed?: string;
  callGasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  paymasterPostOpGasLimit?: string;
  paymasterVerificationGasLimit?: string;
  phases?: GasPhase[];
  preVerificationGas?: string;
  verificationGasLimit?: string;
  userOpHash?: `0x${string}`;
  txHash?: `0x${string}`;
};

type GasPhaseView = {
  key: string;
  label: string;
  gasUsed: number;
  gasLimit: number;
  color: string;
};

type GasSummary = {
  actualGasUsed: number;
  actualGasCostWei: bigint;
  actualGasCostGwei: number;
  actualGasCostEth: number;
  callGasLimit: number;
  verificationGasLimit: number;
  preVerificationGas: number;
  paymasterVerificationGasLimit: number;
  paymasterPostOpGasLimit: number;
  maxFeePerGas: number;
  maxPriorityFeePerGas: number;
  phases: GasPhaseView[];
};

const PHASE_COLORS: Record<string, string> = {
  validation: "#14f195",
  execution: "#00c2ff",
  postop: "#ff7ce5",
  "post-op": "#ff7ce5",
  "pre-verification": "#fbbf24",
  overhead: "#c084fc",
};

type Metadata = {
  image?: string;
  name?: string;
  description?: string;
};

function normalizeUserOpHash(
  input?: string | null
): `0x${string}` | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const prefixed = trimmed.startsWith("0x")
    ? trimmed
    : `0x${trimmed}`;
  return prefixed as `0x${string}`;
}

export default function GasAnalyzer() {
  const { hash } = useParams<{ hash?: string }>();
  const [hashInput, setHashInput] = useState(hash ?? "");
  const [manualHash, setManualHash] = useState<string | null>(null);
  useEffect(() => {
    setHashInput(hash ?? "");
    setManualHash(null);
  }, [hash]);
  const effectiveHash = manualHash ?? hash ?? "";
  const normalizedHash = useMemo(
    () => normalizeUserOpHash(effectiveHash),
    [effectiveHash]
  );
  const { token } = useAuth();
  const [detail, setDetail] = useState<OperationDetail | null>(null);
  const [gasData, setGasData] = useState<GasResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !normalizedHash) return;
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      api.getOpDetail(token, normalizedHash),
      api.getOpGas(token, normalizedHash),
    ])
      .then(([detailData, gas]) => {
        if (!active) return;
        setDetail(detailData);
        setGasData(gas as GasResponse);
      })
      .catch((err) => {
        if (!active) return;
        console.error("Failed to load operation detail", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load operation details."
        );
        setDetail(null);
        setGasData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, normalizedHash]);

  const handleHashSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = hashInput.trim();
    setManualHash(trimmed.length ? trimmed : null);
  };

  const hashForm = (
    <form
      onSubmit={handleHashSubmit}
      className="flex w-full flex-col gap-2 text-sm md:flex-row md:items-center"
    >
      <input
        className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-slate-200"
        placeholder="0xUserOpHash"
        value={hashInput}
        onChange={(event) => setHashInput(event.target.value)}
      />
      <button
        type="submit"
        className="rounded bg-emerald-500/90 px-4 py-2 font-semibold text-slate-900 transition hover:bg-emerald-400"
      >
        Load hash
      </button>
    </form>
  );

  if (!normalizedHash) {
    return (
      <div className="space-y-4">
        <PageHeader title="UserOperation Details" />
        <div className="surface-card space-y-4 p-6 text-sm text-slate-300">
          <p>
            Paste a UserOperation hash to inspect sponsorship metadata,
            error context, and asset movements.
          </p>
          {hashForm}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="UserOperation Details" />

      <div className="surface-card space-y-4 p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
          Look up by hash
        </div>
        <p className="text-sm text-slate-400">
          Paste a UserOperation hash to load its full context. You can also
          arrive here by clicking a row from the Stats or Playground views.
        </p>
        {hashForm}
      </div>

      <div className="surface-card space-y-4 p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
          Summary
        </div>
        {loading ? (
          <div className="text-sm text-slate-400">Loading details…</div>
        ) : error ? (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        ) : detail ? (
          <>
            <SummaryGrid detail={detail} hash={normalizedHash} />
            <DetailGrid detail={detail} />
            {detail.revertReason || detail.revert?.message ? (
              <div className="rounded border border-rose-500/50 bg-rose-500/10 p-4 text-sm text-rose-200">
                <div className="text-xs uppercase tracking-[0.2em] text-rose-300">
                  Revert
                </div>
                <p className="mt-2 font-mono text-sm">
                  {detail.revertReason ?? detail.revert?.message}
                </p>
                {detail.revert?.selector ? (
                  <p className="mt-1 text-xs text-rose-300/80">
                    Selector: {detail.revert.selector}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="text-sm text-slate-400">
            No detail found for this UserOperation.
          </div>
        )}
      </div>

      <GasSection gas={gasData} />
      <AssetMovements detail={detail} />
    </div>
  );
}

function SummaryGrid({ detail, hash }: { detail: OperationDetail; hash: string }) {
  const status = detail.status?.toUpperCase() ?? "UNKNOWN";
  const statusAccent =
    detail.status?.toLowerCase() === "success"
      ? "from-emerald-500/30 to-emerald-500/5 border-emerald-400/50"
      : detail.status?.toLowerCase() === "failed"
      ? "from-rose-500/30 to-rose-500/5 border-rose-400/40"
      : "from-amber-500/30 to-amber-500/5 border-amber-400/40";
  const statusTextClass =
    detail.status?.toLowerCase() === "success"
      ? "text-emerald-200"
      : detail.status?.toLowerCase() === "failed"
      ? "text-rose-200"
      : "text-amber-200";
  const blockTimeDisplay = formatDateTime(detail.blockTime);

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border bg-gradient-to-r ${statusAccent} p-5`}>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-200/70">
          Status
        </div>
        <div className={`mt-2 text-2xl font-semibold ${statusTextClass}`}>
          {status}
        </div>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Block
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-200">
              {detail.blockNumber ?? "-"}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Block Time
            </div>
            <div className="mt-2 text-sm text-slate-200">
              {blockTimeDisplay ?? "-"}
            </div>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
              UserOp Hash
            </div>
            <div className="mt-2 font-mono text-xs text-slate-200 break-all">
              {hash}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Tx Hash
            </div>
            <div className="mt-2 font-mono text-xs text-slate-200 break-all">
              {detail.txHash ?? "-"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailGrid({ detail }: { detail: OperationDetail }) {
  const entries = [
    { label: "Sender", value: detail.sender },
    { label: "Target", value: detail.target },
    { label: "Selector", value: detail.selector },
    { label: "Paymaster", value: detail.paymaster },
    { label: "Nonce", value: detail.nonce },
    { label: "Call Gas Limit", value: detail.callGasLimit },
    { label: "Verification Gas Limit", value: detail.verificationGasLimit },
    { label: "Pre-Verification Gas", value: detail.preVerificationGas },
    {
      label: "Paymaster Verification Gas Limit",
      value: detail.paymasterVerificationGasLimit,
    },
    {
      label: "Paymaster PostOp Gas Limit",
      value: detail.paymasterPostOpGasLimit,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {entries.map((entry) => (
        <div
          key={entry.label}
          className="rounded border border-slate-800 bg-slate-950/30 p-3"
        >
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
            {entry.label}
          </div>
          <div className="mt-1 font-mono text-xs text-slate-200 break-all">
            {entry.value ?? "-"}
          </div>
        </div>
      ))}
    </div>
  );
}

function GasSection({ gas }: { gas: GasResponse | null }) {
  const summary = useMemo(() => normalizeGasResponse(gas), [gas]);
  if (!summary) return (
    <section className="surface-card space-y-4 p-6">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
        Gas Analysis
      </div>
      <div className="rounded border border-dashed border-slate-800 p-4 text-sm text-slate-400">
        Gas details unavailable for this UserOperation.
      </div>
    </section>
  );

  const validationUsage =
    summary.phases.find((p) => p.key === "validation")?.gasUsed ?? 0;
  const executionUsage =
    summary.phases.find((p) => p.key === "execution")?.gasUsed ?? 0;
  const postOpUsage =
    summary.phases.find((p) => p.key === "postop" || p.key === "post-op")
      ?.gasUsed ?? 0;
  const preVerificationUsage =
    summary.phases.find((p) => p.key === "pre-verification")?.gasUsed ?? 0;

  return (
    <section className="space-y-6">
      <div className="surface-card space-y-4 p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
          Gas Analysis
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <SummaryCard
            label="Actual Gas Used"
            value={formatNumber(summary.actualGasUsed)}
            sublabel="Units"
          />
          <SummaryCard
            label="Actual Gas Cost"
            value={formatNumber(summary.actualGasCostGwei, {
              maximumFractionDigits: 0,
            })}
            sublabel={`GWEI (${formatWeiToEth(summary.actualGasCostWei)})`}
          />
          <SummaryCard
            label="Max Fee"
            value={formatGweiFromWei(summary.maxFeePerGas, {
              maximumFractionDigits: 2,
            })}
            sublabel={`Priority ${formatGweiFromWei(
              summary.maxPriorityFeePerGas,
              { maximumFractionDigits: 2 }
            )}`}
          />
          <SummaryCard
            label="Call Gas Limit"
            value={formatNumber(summary.callGasLimit)}
            sublabel="Execution phase"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="surface-card p-6">
            <h3 className="text-sm font-semibold text-slate-200">
              Phase Distribution
            </h3>
            <p className="text-xs text-slate-400">
              Actual gas usage grouped by EntryPoint phases.
            </p>
            <div className="mt-4 flex justify-center">
              <GasDonut phases={summary.phases} />
            </div>
          </div>
          <div className="surface-card surface-card--muted space-y-4 p-6">
            <h3 className="text-sm font-semibold text-slate-200">
              Limits vs Usage
            </h3>
            <ComparisonRow
              label="Validation (verificationGasLimit)"
              input={summary.verificationGasLimit}
              actual={validationUsage}
              warning={{
                code: "AA23",
                message:
                  "Validation gas exceeded the configured limit.",
              }}
            />
            <ComparisonRow
              label="Execution (callGasLimit)"
              input={summary.callGasLimit}
              actual={executionUsage}
            />
            <ComparisonRow
              label="Paymaster Verification"
              input={summary.paymasterVerificationGasLimit}
              actual={validationUsage}
              warning={{
                code: "AA33",
                message: "Paymaster validation ran out of gas.",
              }}
            />
            <ComparisonRow
              label="Paymaster PostOp"
              input={summary.paymasterPostOpGasLimit}
              actual={postOpUsage}
              warning={{
                code: "AA33",
                message: "Paymaster postOp exceeded the allowed gas.",
              }}
            />
            <ComparisonRow
              label="Pre-Verification"
              input={summary.preVerificationGas}
              actual={preVerificationUsage}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function AssetMovements({ detail }: { detail: OperationDetail | null }) {
  const movements = detail?.assetMovements ?? [];
  if (!detail) return null;

  return (
    <section className="surface-card space-y-4 p-6">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
        Asset Movements
      </div>
      {movements.length === 0 ? (
        <div className="rounded border border-dashed border-slate-800 p-4 text-sm text-slate-400">
          No asset deltas were recorded for this UserOperation.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.16em] text-slate-400">
                <th className="px-3 py-2">Address</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Token</th>
                <th className="px-3 py-2">Token ID</th>
                <th className="px-3 py-2">Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60">
              {movements.map((movement, idx) => (
                <tr key={`${movement.address}-${movement.token}-${idx}`}>
                  <td className="px-3 py-2 font-mono text-xs text-slate-300">
                    {movement.address ?? "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    <RoleCell detail={detail} movement={movement} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">
                    {movement.token ?? "-"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">
                    {movement.tokenId ?? "-"}
                  </td>
                  <td
                    className={`px-3 py-2 font-mono text-xs ${
                      movement.delta?.startsWith("-")
                        ? "text-rose-300"
                        : "text-emerald-300"
                    }`}
                  >
                    {formatAssetDelta(movement)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RoleCell({
  detail,
  movement,
}: {
  detail: OperationDetail;
  movement: AssetMovement;
}) {
  const role = movementAddressRole(movement.address, detail, movement);
  if (!role.hint) return <span>{role.label}</span>;
  return (
    <Tooltip content={role.hint}>
      <span className="cursor-help underline decoration-dotted underline-offset-4">
        {role.label}
      </span>
    </Tooltip>
  );
}

function formatNumber(
  value?: string | number,
  options?: Intl.NumberFormatOptions
) {
  if (value === undefined || value === null) return "-";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return numeric.toLocaleString(undefined, options);
}

function formatDateTime(value?: string) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatWei(value?: string) {
  if (!value) return { eth: "-", gwei: "-" };
  try {
    const wei = BigInt(value);
    const gwei = Number(wei) / 1_000_000_000;
    const eth = Number(wei) / 1_000_000_000_000_000_000;
    return {
      gwei: Number.isFinite(gwei)
        ? `${gwei.toLocaleString(undefined, {
            maximumFractionDigits: 6,
          })} GWEI`
        : `${value} wei`,
      eth: Number.isFinite(eth)
        ? `≈ ${eth.toLocaleString(undefined, {
            maximumFractionDigits: 6,
          })} ETH`
        : undefined,
    };
  } catch {
    return { eth: value, gwei: value };
  }
}

function shorten(value?: string) {
  if (!value) return "-";
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function SummaryCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold text-slate-50">{value}</div>
      {sublabel ? (
        <div className="text-xs text-slate-400">{sublabel}</div>
      ) : null}
    </div>
  );
}

function GasDonut({ phases }: { phases: GasPhaseView[] }) {
  const total = phases.reduce((sum, phase) => sum + phase.gasUsed, 0) || 1;
  let offset = 0;
  const segments = phases
    .filter((phase) => phase.gasUsed > 0)
    .map((phase, idx) => {
      const percent = (phase.gasUsed / total) * 100;
      const start = offset;
      const end = offset + percent;
      offset = end;
      const color =
        PHASE_COLORS[phase.key] ??
        Object.values(PHASE_COLORS)[idx % Object.keys(PHASE_COLORS).length];
      return `${color} ${start}% ${end}%`;
    });
  const gradient =
    segments.length > 0
      ? `conic-gradient(from -90deg, ${segments.join(", ")})`
      : "radial-gradient(circle, #1e293b 0%, #0f172a 100%)";
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="h-48 w-48 rounded-full border border-slate-700"
        style={{ background: gradient }}
      >
        <div className="mx-auto my-6 flex h-36 w-36 flex-col items-center justify-center rounded-full border border-slate-800 bg-slate-950/80 text-center text-sm text-slate-200">
          <span>Total Used</span>
          <span className="text-lg font-semibold">
            {formatNumber(total)}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-3 text-xs">
        {phases.map((phase) => (
          <div key={phase.key} className="flex items-center gap-2 text-slate-200">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  PHASE_COLORS[phase.key] ??
                  Object.values(PHASE_COLORS)[0],
              }}
            />
            <span className="flex items-center gap-1">
              {phase.label}: {formatNumber(phase.gasUsed)} Gas
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComparisonRow({
  label,
  input,
  actual,
  warning,
}: {
  label: string;
  input: number;
  actual: number;
  warning?: { code: string; message: string };
}) {
  const ratio = input > 0 ? actual / input : 0;
  const percent = input > 0 ? Math.min(100, Math.round(ratio * 100)) : 0;
  const exceeded = input > 0 && actual > input;
  const warningMessage =
    exceeded && warning
      ? `${warning.code}: ${warning.message}`
      : exceeded
      ? "Gas usage exceeded the configured limit."
      : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className={exceeded ? "text-rose-300" : undefined}>
          Used {formatNumber(actual)} / Limit {formatNumber(input)}
        </span>
      </div>
      <div className="h-2 rounded bg-slate-800">
        <div
          className={`h-2 rounded ${
            exceeded ? "bg-rose-500" : "bg-indigo-500"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {exceeded ? (
        <div className="flex items-center gap-2 text-xs text-rose-300">
          <Tooltip content={warningMessage ?? ""}>
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-rose-400 bg-rose-500/10 font-semibold text-rose-200">
              !
            </span>
          </Tooltip>
          <span>{warning?.message ?? "Usage exceeded the configured limit."}</span>
        </div>
      ) : null}
    </div>
  );
}

function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      {content ? (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-pre rounded bg-slate-900 px-2 py-1 text-[10px] text-slate-100 shadow-lg group-hover:block">
          {content}
        </span>
      ) : null}
    </span>
  );
}

function normalizeGasResponse(data?: GasResponse | null): GasSummary | null {
  if (!data) return null;
  const actualGasUsed = toNumber(data.actualGasUsed);
  const actualGasCostWei =
    data.actualGasCost !== undefined ? BigInt(data.actualGasCost) : 0n;
  const actualGasCostGwei = Number(actualGasCostWei) / 1_000_000_000;
  const actualGasCostEth = Number(actualGasCostWei) / 1_000_000_000_000_000_000;

  const basePhases: GasPhaseView[] = Array.isArray(data.phases)
    ? data.phases.map((phase) => ({
        key: phase.phase.toLowerCase(),
        label: formatLabel(phase.phase),
        gasUsed: toNumber(phase.gasUsed),
        gasLimit: toNumber(phase.gasLimit),
        color: PHASE_COLORS[phase.phase.toLowerCase()] ?? "#a5b4fc",
      }))
    : [];

  const preVerificationGas = toNumber(data.preVerificationGas);
  if (preVerificationGas > 0) {
    basePhases.push({
      key: "pre-verification",
      label: "Pre-Verification",
      gasUsed: preVerificationGas,
      gasLimit: preVerificationGas,
      color: PHASE_COLORS["pre-verification"],
    });
  }

  if (actualGasUsed > 0) {
    const phaseTotal = basePhases.reduce(
      (sum, phase) => sum + phase.gasUsed,
      0
    );
    if (phaseTotal < actualGasUsed) {
      basePhases.push({
        key: "overhead",
        label: "Overhead",
        gasUsed: actualGasUsed - phaseTotal,
        gasLimit: actualGasUsed - phaseTotal,
        color: PHASE_COLORS["overhead"],
      });
    }
  }

  return {
    actualGasUsed,
    actualGasCostWei,
    actualGasCostGwei,
    actualGasCostEth,
    callGasLimit: toNumber(data.callGasLimit),
    verificationGasLimit: toNumber(data.verificationGasLimit),
    preVerificationGas,
    paymasterVerificationGasLimit: toNumber(
      data.paymasterVerificationGasLimit
    ),
    paymasterPostOpGasLimit: toNumber(data.paymasterPostOpGasLimit),
    maxFeePerGas: toNumber(data.maxFeePerGas),
    maxPriorityFeePerGas: toNumber(data.maxPriorityFeePerGas),
    phases: basePhases,
  };
}

function formatLabel(phase: string) {
  if (!phase) return "Unknown";
  switch (phase.toLowerCase()) {
    case "validation":
      return "Validation";
    case "execution":
      return "Execution";
    case "postop":
    case "post-op":
      return "Post-Op";
    default:
      return phase[0].toUpperCase() + phase.slice(1);
  }
}

function toNumber(value?: string | number | bigint): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatWeiToEth(value: bigint) {
  const eth = Number(value) / 1_000_000_000_000_000_000;
  if (!Number.isFinite(eth)) return "-";
  return `≈ ${eth.toLocaleString(undefined, {
    maximumFractionDigits: 6,
  })} ETH`;
}

function formatGweiFromWei(
  valueWei: number,
  options?: Intl.NumberFormatOptions
) {
  if (!Number.isFinite(valueWei)) return "-";
  const gwei = valueWei / 1_000_000_000;
  if (!Number.isFinite(gwei)) return "-";
  return `${gwei.toLocaleString(undefined, options)} GWEI`;
}

function movementAddressRole(
  address: string | undefined,
  detail: OperationDetail | null,
  movement?: AssetMovement
) {
  if (!address || !detail) return { label: "-" };
  const normalized = address.toLowerCase();
  if (detail.sender?.toLowerCase() === normalized)
    return { label: "Sender" };
  if (detail.target?.toLowerCase() === normalized)
    return { label: "Target" };
  if (detail.paymaster?.toLowerCase() === normalized)
    return { label: "Paymaster" };
  if (detail.beneficiary?.toLowerCase() === normalized)
    return { label: "Beneficiary" };
  if (
    movement?.token?.toUpperCase() === "ETH" &&
    movement.delta?.startsWith("-")
  ) {
    return {
      label: "EntryPoint",
      hint: "EntryPoint pulled from the paymaster deposit to cover sponsorship.",
    };
  }
  return { label: "-" };
}

function formatAssetDelta(movement: AssetMovement) {
  if (!movement.delta) return "-";
  const token = movement.token?.toUpperCase() ?? "";
  if (token !== "ETH") return movement.delta;
  try {
    const sign = movement.delta.trim().startsWith("-") ? "-" : "+";
    const raw = movement.delta.replace(/[+-]/, "");
    const wei = BigInt(raw || "0");
    const eth = Number(wei) / 1_000_000_000_000_000_000;
    if (!Number.isFinite(eth)) return movement.delta;
    return `${sign}${eth.toLocaleString(undefined, {
      maximumFractionDigits: 6,
    })} ETH`;
  } catch {
    return movement.delta;
  }
}
