type StatCardProps = {
  label: string;
  value: string | number;
  sublabel?: string;
  className?: string;
};

export default function StatCard({
  label,
  value,
  sublabel,
  className,
}: StatCardProps) {
  return (
    <div
      className={`bg-[#151A28] border border-slate-800 rounded-xl p-4 ${className ?? ""}`}
    >
      <div className="text-slate-400 text-sm">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sublabel ? (
        <div className="mt-1 text-xs text-slate-500">{sublabel}</div>
      ) : null}
    </div>
  );
}
