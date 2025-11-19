import { Link } from "react-router-dom";

type Tx = {
  userOpHash?: string;
  sender?: string;
  target?: string;
  selector?: string;
  status?: string;
  timestamp?: string;
};

export default function TxTable({ rows }: { rows: Tx[] }) {
  return (
    <div className="surface-card">
      <div className="overflow-x-auto">
        <table className="table-modern text-sm">
          <thead>
            <tr>
              <th className="text-left">UserOp</th>
              <th className="text-left">Sender</th>
              <th className="text-left">Target</th>
              <th className="text-left">Selector</th>
              <th className="text-left">Status</th>
              <th className="text-left">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, index) => {
              const userOpHash = r.userOpHash ?? "";
              const sender = r.sender ?? "";
              const target = r.target ?? "";
              const selector = r.selector ?? "";
              const status = r.status ?? "-";
              const normalizedStatus = status ? status.toUpperCase() : "-";
              const time = r.timestamp
                ? new Date(r.timestamp).toLocaleString()
                : "-";
              const key = userOpHash || `${sender}:${target}:${index}`;

              return (
                <tr key={key} className="text-sm">
                  <td className="font-mono text-indigo-300 hover:text-indigo-100">
                    {userOpHash ? (
                      <Link
                        to={`/app/details/${userOpHash}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {`${userOpHash.slice(0, 12)}…`}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="font-mono">
                    {sender ? `${sender.slice(0, 12)}…` : "-"}
                  </td>
                  <td className="font-mono">
                    {target ? `${target.slice(0, 12)}…` : "-"}
                  </td>
                  <td className="font-mono">{selector}</td>
                  <td
                    className={`font-semibold ${
                      status.toLowerCase() === "success"
                        ? "text-emerald-400"
                        : status.toLowerCase() === "failed"
                        ? "text-rose-400"
                        : "text-slate-300"
                    }`}
                  >
                    {normalizedStatus}
                  </td>
                  <td>{time}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
