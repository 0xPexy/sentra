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
    <div className={`surface-card p-5 ${className ?? ""}`}>
      <div className="text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
      {sublabel ? (
        <div className="mt-1 text-xs text-slate-400">{sublabel}</div>
      ) : null}
    </div>
  );
}
