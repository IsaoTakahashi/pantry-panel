export default function StockItemsSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-slate-100 py-2 px-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00d1b2] to-[#0d9488] flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold select-none">
                P
              </span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Pantry Panel
            </h1>
          </div>
          <div className="h-8 w-32 bg-gray-200 rounded-lg animate-pulse" />
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-4">
        <div className="mb-4 h-10 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {["s1", "s2", "s3", "s4", "s5", "s6"].map((id) => (
            <div
              key={id}
              className="bg-white rounded-lg shadow p-4 animate-pulse"
            >
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
