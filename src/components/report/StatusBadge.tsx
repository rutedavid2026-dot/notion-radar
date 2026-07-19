const STATUS_STYLES: Record<string, string> = {
  Concluído: "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Em andamento": "bg-blue-100 text-blue-700 border-blue-200",
  "Não iniciado": "bg-slate-100 text-slate-700 border-slate-200",
  Agendado: "bg-violet-100 text-violet-700 border-violet-200",
  Orçamento: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Aguardando: "bg-orange-100 text-orange-700 border-orange-200",
};

const PRIORIDADE_STYLES: Record<string, string> = {
  Baixa: "bg-slate-100 text-slate-700 border-slate-200",
  Média: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Alta: "bg-orange-100 text-orange-700 border-orange-200",
  Urgente: "bg-red-100 text-red-700 border-red-200",
};

export function StatusBadge({ value }: { value: string }) {
  const cls = STATUS_STYLES[value] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {value}
    </span>
  );
}

export function PrioridadeBadge({ value }: { value: string }) {
  const cls = PRIORIDADE_STYLES[value] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {value}
    </span>
  );
}
