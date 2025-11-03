import { useState } from "react";

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
                  onClick={() => setSelected(r)}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-xl rounded-xl border border-slate-700 bg-[#0f1522] p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-100">
                User Operation Details
              </h3>
              <button
                className="text-slate-400 hover:text-slate-200"
                onClick={() => setSelected(null)}
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
                label="Revert Reason"
                value="(demo) Execution reverted: Not enough allowance"
              />
              <DetailRow
                label="Tx Hash"
                value="(demo) 0xabc...123"
              />
              <DetailRow
                label="Paymaster Subsidy"
                value="(demo) Sponsored 0.0023 ETH"
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:border-slate-400 hover:text-slate-100"
                onClick={() => setSelected(null)}
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="font-mono text-sm text-slate-100 break-all">{value}</span>
    </div>
  );
}
