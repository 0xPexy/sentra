type Tx = { userOpHash: string; sender: string; target: string; selector: string; status: string; timestamp: string; };
export default function TxTable({ rows }: { rows: Tx[] }) {
  return (
    <div className="bg-[#151A28] border border-slate-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-900/60">
          <tr>
            <th className="text-left p-3">UserOp</th>
            <th className="text-left p-3">Sender</th>
            <th className="text-left p-3">Target</th>
            <th className="text-left p-3">Selector</th>
            <th className="text-left p-3">Status</th>
            <th className="text-left p-3">Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userOpHash} className="border-t border-slate-800">
              <td className="p-3 font-mono">{r.userOpHash.slice(0,10)}…</td>
              <td className="p-3 font-mono">{r.sender.slice(0,10)}…</td>
              <td className="p-3 font-mono">{r.target.slice(0,10)}…</td>
              <td className="p-3 font-mono">{r.selector}</td>
              <td className="p-3">{r.status}</td>
              <td className="p-3">{new Date(r.timestamp).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}