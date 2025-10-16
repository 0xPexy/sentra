export default function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[#151A28] border border-slate-800 rounded-xl p-4">
      <div className="text-slate-400 text-sm">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}