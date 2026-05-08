import type { UsageSummary } from "@/lib/usage";

export function UsageSummaryCard({
  title,
  description,
  summary,
  variant = "default"
}: {
  title: string;
  description: string;
  summary: UsageSummary;
  variant?: "default" | "compact";
}) {
  if (variant === "compact") {
    return (
      <details className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">{description}</p>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="text-xs text-slate-500">Estimated total</p>
              <p className="text-base font-semibold text-slate-900">{formatUsd(summary.totalUsd)}</p>
            </div>
            <div className="text-xs text-slate-500">
              {summary.totalRequests} API call{summary.totalRequests === 1 ? "" : "s"} • {summary.totalTokens.toLocaleString()} tokens
            </div>
            <span className="text-xs font-medium text-slate-600">View details</span>
          </div>
        </summary>
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <div className="grid gap-3 md:grid-cols-2">
            {summary.groups.map((group) => (
              <div key={group.key} className="rounded-md border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-slate-900">{group.label}</h3>
                    <p className="text-xs text-slate-500">
                      {group.requestCount} call{group.requestCount === 1 ? "" : "s"} • {group.totalTokens.toLocaleString()} tokens
                    </p>
                  </div>
                  <span className="text-sm font-medium text-slate-700">{formatUsd(group.usdTotal)}</span>
                </div>
                {group.operations.length ? (
                  <ul className="mt-3 space-y-2 text-sm text-slate-600">
                    {group.operations.map((operation) => (
                      <li key={operation.name} className="flex items-center justify-between gap-3">
                        <span>{operation.label}</span>
                        <span className="text-slate-500">
                          {operation.requestCount} • {formatUsd(operation.usdTotal)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">No paid calls yet.</p>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Costs are estimated from API-reported token usage and the current model pricing table.
          </p>
        </div>
      </details>
    );
  }

  return (
    <section className="panel space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <div className="rounded-md bg-slate-50 px-4 py-3 text-right">
          <p className="text-xs text-slate-500">Estimated total</p>
          <p className="text-2xl font-semibold">{formatUsd(summary.totalUsd)}</p>
          <p className="text-xs text-slate-500">
            {summary.totalRequests} API call{summary.totalRequests === 1 ? "" : "s"} • {summary.totalTokens.toLocaleString()} tokens
          </p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {summary.groups.map((group) => (
          <div key={group.key} className="rounded-md border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium text-slate-900">{group.label}</h3>
                <p className="text-xs text-slate-500">
                  {group.requestCount} call{group.requestCount === 1 ? "" : "s"} • {group.totalTokens.toLocaleString()} tokens
                </p>
              </div>
              <span className="text-sm font-medium text-slate-700">{formatUsd(group.usdTotal)}</span>
            </div>
            {group.operations.length ? (
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {group.operations.map((operation) => (
                  <li key={operation.name} className="flex items-center justify-between gap-3">
                    <span>{operation.label}</span>
                    <span className="text-slate-500">
                      {operation.requestCount} • {formatUsd(operation.usdTotal)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No paid calls yet.</p>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Costs are estimated from API-reported token usage and the current model pricing table.
      </p>
    </section>
  );
}

function formatUsd(value: number) {
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`;
}
