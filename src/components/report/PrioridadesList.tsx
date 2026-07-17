import { AlertTriangle } from "lucide-react";
import type { Demanda } from "@/lib/notion.functions";
import { formatDatePt } from "@/lib/report-utils";
import { PrioridadeBadge, StatusBadge } from "./StatusBadge";

export function PrioridadesList({ rows }: { rows: Demanda[] }) {
  const items = rows
    .filter((r) => (r.prioridade === "Alta" || r.prioridade === "Urgente") && r.status !== "Concluído")
    .sort((a, b) => (a.prioridade === "Urgente" && b.prioridade !== "Urgente" ? -1 : 1));

  return (
    <div className="bg-card rounded-xl border p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <AlertTriangle className="text-red-600 h-4 w-4" />
        <h3 className="text-foreground text-sm font-semibold">Prioridades (Alta e Urgente)</h3>
      </div>
      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Nenhuma demanda de alta prioridade em aberto. ✨
          </p>
        ) : (
          items.map((r) => (
            <a
              key={r.id}
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 transition"
            >
              <div className="min-w-0 flex-1">
                <div className="text-foreground truncate text-sm font-medium">{r.demanda}</div>
                <div className="text-muted-foreground mt-0.5 text-xs">
                  {r.responsavel} · Criada em {formatDatePt(r.criadaEm)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <PrioridadeBadge value={r.prioridade} />
                <StatusBadge value={r.status} />
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
