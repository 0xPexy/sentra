import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../components/layout/PageHeader";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

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
  postOp: "#ff7ce5",
  "pre-verification": "#fbbf24",
  overhead: "#c084fc",
};

function isUserOpHash(value: string | null): value is `0x${string}` {
  if (!value) return false;
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function toNumber(value?: string | number | bigint): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function formatNumber(value: number, options?: Intl.NumberFormatOptions) {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, options);
}

function formatWeiToEth(value: bigint) {
  const eth = Number(value) / 1_000_000_000_000_000_000;
  if (!Number.isFinite(eth)) return "-";
  return `≈ ${eth.toLocaleString(undefined, {
    maximumFractionDigits: 6,
  })} ETH`;
}

function formatGweiFromWei(valueWei: number, options?: Intl.NumberFormatOptions) {
  if (!Number.isFinite(valueWei)) return "-";
  const gwei = valueWei / 1_000_000_000;
  if (!Number.isFinite(gwei)) return "-";
  return `${gwei.toLocaleString(undefined, options)} GWEI`;
}

function normalizeGasResponse(data?: GasResponse): GasSummary | null {
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

function useGasAnalysis(
  token: string | null | undefined,
  hash: `0x${string}` | null
) {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    detail: any | null;
    gas: GasResponse | null;
  }>({ loading: false, error: null, detail: null, gas: null });

  useEffect(() => {
    if (!token || !hash) return;
    let cancelled = false;
    const load = async () => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const [detail, gas] = await Promise.all([
          api.getOpDetail(token, hash),
          api.getOpGas(token, hash),
        ]);
        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            detail,
            gas: gas as GasResponse,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to load gas analysis.",
            detail: null,
            gas: null,
          });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, hash]);

  return state;
}

function GasDonut({ phases }: { phases: GasPhaseView[] }) {
  const total = phases.reduce((sum, phase) => sum + phase.gasUsed, 0) || 1;
  const palette = ["#14f195", "#00c2ff", "#ff7ce5", "#fbbf24", "#c084fc"];
  const decorated = phases.map((phase, idx) => ({
    ...phase,
    gradientColor: palette[idx % palette.length],
  }));
  let offset = 0;
  const segments = decorated
    .filter((phase) => phase.gasUsed > 0)
    .map((phase) => {
      const percent = (phase.gasUsed / total) * 100;
      const start = offset;
      const end = offset + percent;
      offset = end;
      return `${phase.gradientColor} ${start}% ${end}%`;
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
        <div className="mx-auto my-6 flex h-36 w-36 items-center justify-center rounded-full bg-slate-950/80 border border-slate-800 text-center text-sm text-slate-200">
          Total Used
          <br />
          {formatNumber(total)}
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-3 text-xs">
        {decorated.map((phase) => (
          <div key={phase.key} className="flex items-center gap-2 text-slate-200">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: phase.gradientColor }}
            />
            <span className="flex items-center gap-1">
              {phase.label}
              {phase.key === "overhead" ? (
                <Tooltip content="Overhead = actualGasUsed minus the sum of reported phases. Includes calldata costs and other unattributed execution.">
                  <span className="flex h-3 w-3 items-center justify-center rounded-full border border-slate-500 text-[10px] text-slate-200">
                    ?
                  </span>
                </Tooltip>
              ) : null}
              : {formatNumber(phase.gasUsed)} Gas
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
      ? "Gas usage exceeded the configured limit. Adjust your parameters."
      : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span
          className={exceeded ? "text-rose-300" : undefined}
        >{`Used ${formatNumber(actual)} / Limit ${formatNumber(input)}`}</span>
      </div>
      <div className="h-2 rounded bg-slate-800">
        <div
          className={`h-2 rounded ${exceeded ? "bg-rose-500" : "bg-indigo-500"}`}
          style={{
            width: `${Number.isFinite(percent) ? percent : 0}%`,
          }}
        />
      </div>
      {exceeded ? (
        <div className="flex items-center gap-2 text-xs text-rose-300">
          <Tooltip content={warningMessage ?? ""}>
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-rose-400 bg-rose-500/10 font-semibold text-rose-200">
              !
            </span>
          </Tooltip>
          <span>
            {warning?.message ?? "Usage exceeded the configured gas limit."}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export default function GasAnalyzer() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const hashParam = searchParams.get("hash") ?? "";
  const [hashInput, setHashInput] = useState(hashParam);
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    setHashInput(hashParam);
  }, [hashParam]);

  const hash = isUserOpHash(hashParam) ? (hashParam as `0x${string}`) : null;

  const { loading, error, detail, gas } = useGasAnalysis(token, hash);
  const summary = useMemo(() => normalizeGasResponse(gas ?? undefined), [gas]);
  const validationUsage =
    summary?.phases.find((p) => p.key === "validation")?.gasUsed ?? 0;
  const executionUsage =
    summary?.phases.find((p) => p.key === "execution")?.gasUsed ?? 0;
  const preVerificationUsage =
    summary?.phases.find((p) => p.key === "pre-verification")?.gasUsed ?? 0;
  const paymasterPostUsage =
    summary?.phases.find((p) => p.key === "postop")?.gasUsed ?? 0;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isUserOpHash(hashInput)) {
      setInputError("Enter a valid 32-byte hash (0x + 64 hex characters).");
      return;
    }
    setInputError(null);
    setSearchParams({ hash: hashInput });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Gas Analyzer" />

      <form onSubmit={handleSubmit} className="surface-card p-6 space-y-3">
        <label className="text-xs uppercase tracking-wide text-slate-400">
          User Operation Hash
        </label>
        <div className="mt-2 flex flex-col gap-3 md:flex-row">
          <input
            className="flex-1 rounded border border-slate-700 bg-slate-900/70 px-3 py-2 font-mono text-sm text-slate-100"
            placeholder="0x..."
            value={hashInput}
            onChange={(event) => setHashInput(event.target.value)}
          />
          <button type="submit" className="btn-primary">
            Analyze
          </button>
        </div>
        {inputError ? (
          <p className="mt-2 text-xs text-rose-300">{inputError}</p>
        ) : null}
      </form>

      {loading ? (
        <div className="surface-card p-4 text-sm text-slate-300">
          Loading gas analysis…
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {summary ? (
        <>
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
              label="Max Fee Per Gas"
              value={formatGweiFromWei(summary.maxFeePerGas, {
                maximumFractionDigits: 2,
              })}
              sublabel={`Priority: ${formatGweiFromWei(
                summary.maxPriorityFeePerGas,
                { maximumFractionDigits: 2 }
              )}`}
            />
            <SummaryCard
              label="Call Gas Used"
              value={formatNumber(
                summary.phases.find((p) => p.key === "execution")?.gasUsed ?? 0
              )}
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
            <div className="surface-card surface-card--muted p-6 space-y-4">
              <h3 className="text-sm font-semibold text-slate-200">
                Limits vs Usage
              </h3>
              <ComparisonRow
                label="Validation (verificationGasLimit)"
                input={summary.verificationGasLimit}
                actual={validationUsage}
                warning={{
                  code: "AA23",
                  message: "Validation gas limit exhausted (validation reverted or OOG).",
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
                actual={paymasterPostUsage}
                warning={{
                  code: "AA33",
                  message: "Paymaster postOp ran out of gas.",
                }}
              />
              <ComparisonRow
                label="Pre-Verification (preVerificationGas)"
                input={summary.preVerificationGas}
                actual={preVerificationUsage}
              />
            </div>
          </div>

          <div className="surface-card p-6">
            <h3 className="text-sm font-semibold text-slate-200">Details</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <DetailItem label="UserOp Hash" value={gas?.userOpHash ?? "-"} />
              <DetailItem label="Tx Hash" value={gas?.txHash ?? detail?.txHash ?? "-"} />
              <DetailItem
                label="Sender"
                value={detail?.sender ?? "-"}
              />
              <DetailItem label="Target" value={detail?.target ?? "-"} />
              <DetailItem label="Selector" value={detail?.selector ?? "-"} />
              <DetailItem
                label="Status"
                value={detail?.status ?? detail?.receiptStatus ?? "-"}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
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
    <div className="surface-card p-4">
      <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-100">{value}</div>
      {sublabel ? (
        <div className="text-xs text-slate-400">{sublabel}</div>
      ) : null}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm text-slate-200 break-all">{value}</div>
    </div>
  );
}

function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex items-center">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 hidden w-48 -translate-x-1/2 translate-y-1 rounded bg-slate-900 px-3 py-2 text-xs text-slate-100 shadow-lg group-hover:block">
        {content}
      </span>
    </span>
  );
}
