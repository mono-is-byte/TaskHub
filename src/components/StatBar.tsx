export default function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] leading-[1.35] sm:gap-1 sm:text-[12px] sm:leading-[1.4]">
      <span className="w-28 shrink-0 truncate sm:w-40">{label}</span>
      <div className="h-1.5 flex-1 rounded bg-line sm:h-3">
        <div className="h-1.5 rounded sm:h-3" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: color }} />
      </div>
      <span className="w-12 text-right tabular-nums sm:w-16">{value}</span>
    </div>
  );
}
