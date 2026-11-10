export default function ProjectLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-6 w-64 rounded-md bg-[var(--row-hover)]" />
        <div className="h-5 w-20 rounded-md bg-[var(--row-hover)]" />
      </div>
      <div className="mb-4 flex gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-7 w-16 rounded-md bg-[var(--row-hover)]" />
        ))}
      </div>
      <div className="flex gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="tt-card min-w-40 flex-1 p-3">
            <div className="mb-2 h-4 w-24 rounded-md bg-[var(--row-hover)]" />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-12 rounded-md bg-[var(--row-hover)]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
