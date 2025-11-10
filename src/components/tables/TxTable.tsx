import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../state/auth";

type Tx = {
  userOpHash?: string;
  sender?: string;
  target?: string;
  selector?: string;
  status?: string;
  timestamp?: string;
};

export default function TxTable({ rows }: { rows: Tx[] }) {
  const [selected, setSelected] = useState<Tx | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const { token } = useAuth();

  const blockNumberDisplay = selected
    ? detail?.blockNumber ?? detail?.block_number ?? undefined
    : undefined;
  const gasInfo = selected ? formatSponsoredGas(detail?.actualGasCost) : undefined;
  const beneficiaryAddress = detail?.beneficiary ?? detail?.beneficiaryAddress;
  const revertMessage = selected
    ? detail?.revertReason ?? detail?.revert?.message ?? ""
    : "";
  const txHashDisplay = selected ? detail?.txHash ?? "-" : "-";
  const gasUsedDisplay = selected
    ? formatGasUsed(detail?.actualGasUsed)
    : "-";
  const showRevert =
    selected?.status?.toLowerCase() === "success" ? false : Boolean(revertMessage);

  return (
    <div className="bg-[#151A28] border border-slate-800 rounded-xl overflow-hidden">
      <table className="w-full text-base">
        <thead className="bg-slate-900/60 text-sm uppercase tracking-wide text-slate-400">
          <tr>
            <th className="text-left p-4">UserOp</th>
            <th className="text-left p-4">Sender</th>
            <th className="text-left p-4">Target</th>
            <th className="text-left p-4">Selector</th>
            <th className="text-left p-4">Status</th>
            <th className="text-left p-4">Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, index) => {
            const userOpHash = r.userOpHash ?? "";
            const sender = r.sender ?? "";
            const target = r.target ?? "";
            const selector = r.selector ?? "";
            const status = r.status ?? "-";
            const time = r.timestamp ? new Date(r.timestamp).toLocaleString() : "-";

            const key = userOpHash || `${sender}:${target}:${index}`;

            return (
              <tr key={key} className="border-t border-slate-800 text-base">
                <td
                  className="p-4 font-mono text-indigo-400 hover:text-indigo-200 cursor-pointer"
                  onClick={() => {
                    setSelected(r);
                    setDetail(null);
                    if (r.userOpHash) {
                      (async () => {
                        try {
                          setDetailLoading(true);
                          const hash = r.userOpHash as `0x${string}`;
                          const detailResultPromise = api.getOpDetail(
                            token,
                            hash
                          );
                          const gasResultPromise = api
                            .getOpGas(token, hash)
                            .then((gas) => {
                              console.log("op gas", gas);
                              return gas;
                            })
                            .catch((error) => {
                              console.error("failed to fetch op gas", error);
                              return null;
                            });
                          const [detailResult] = await Promise.all([
                            detailResultPromise,
                            gasResultPromise,
                          ]);
                          console.log("op detail", detailResult);
                          setDetail(detailResult);
                        } catch (e) {
                          console.error("failed to fetch op detail", e);
                          setDetail(null);
                        } finally {
                          setDetailLoading(false);
                        }
                      })();
                    }
                  }}
                  role="button"
                >
                  {userOpHash ? `${userOpHash.slice(0, 12)}…` : "-"}
                </td>
                <td className="p-4 font-mono">
                  {sender ? `${sender.slice(0, 12)}…` : "-"}
                </td>
                <td className="p-4 font-mono">
                  {target ? `${target.slice(0, 12)}…` : "-"}
                </td>
                <td className="p-4 font-mono">{selector}</td>
                <td
                  className={`p-4 font-semibold ${
                    status.toLowerCase() === "success"
                      ? "text-emerald-400"
                      : status.toLowerCase() === "failed"
                      ? "text-rose-400"
                      : "text-slate-300"
                  }`}
                >
                  {status}
                </td>
                <td className="p-4">{time}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => {
            setSelected(null);
            setDetail(null);
            setDetailLoading(false);
          }}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-slate-700 bg-[#0f1522] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-100">
                User Operation Details
              </h3>
              <button
                className="text-slate-400 hover:text-slate-200"
                onClick={() => {
                  setSelected(null);
                  setDetail(null);
                  setDetailLoading(false);
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-200">
              <DetailRow label="UserOp Hash" value={selected.userOpHash ?? "-"} />
              <DetailRow label="Sender" value={selected.sender ?? "-"} />
              <DetailRow label="Target" value={selected.target ?? "-"} />
              <DetailRow label="Selector" value={selected.selector ?? "-"} />
              <DetailRow label="Status" value={selected.status ?? "-"} />
              <DetailRow
                label="Block Number"
                value={blockNumberDisplay ? blockNumberDisplay.toString() : "-"}
              />
              <DetailRow
                label="Sponsored Gas (GWEI)"
                value={gasInfo?.gwei ?? "-"}
                secondary={gasInfo?.eth}
              />
              <DetailRow
                label="Beneficiary"
                value={beneficiaryAddress ?? "-"}
              />
              <DetailRow label="Gas Used" value={gasUsedDisplay} />
              {showRevert ? (
                <DetailRow label="Revert Reason" value={revertMessage} />
              ) : null}
              <DetailRow label="Tx Hash" value={txHashDisplay} />
              {detailLoading ? (
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Fetching detailed information…
                </div>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              {selected.userOpHash ? (
                <Link
                  to={`/gas?hash=${selected.userOpHash}`}
                  className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  Analyze Gas
                </Link>
              ) : null}
              <button
                className="rounded border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:border-slate-400 hover:text-slate-100"
                onClick={() => {
                  setSelected(null);
                  setDetail(null);
                  setDetailLoading(false);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({
  label,
  value,
  secondary,
}: {
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="font-mono text-sm text-slate-100 break-all">{value}</span>
      {secondary ? (
        <span className="font-mono text-xs text-slate-500">{secondary}</span>
      ) : null}
    </div>
  );
}

function formatSponsoredGas(actualGasCost?: string) {
  if (!actualGasCost) return undefined;
  const wei = Number(actualGasCost);
  if (!Number.isFinite(wei)) return undefined;
  const gweiValue = wei / 1_000_000_000;
  const ethValue = wei / 1_000_000_000_000_000_000;
  return {
    gwei: `${gweiValue.toLocaleString(undefined, {
      maximumFractionDigits: 6,
    })} GWEI`,
    eth: `≈ ${ethValue.toLocaleString(undefined, {
      maximumFractionDigits: 6,
    })} ETH`,
  };
}

function formatGasUsed(actualGasUsed?: string) {
  if (!actualGasUsed) return "-";
  const used = Number(actualGasUsed);
  if (!Number.isFinite(used)) return actualGasUsed;
  return used.toLocaleString();
}
