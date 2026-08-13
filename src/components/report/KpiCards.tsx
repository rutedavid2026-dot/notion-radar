type Kpi = {
  label: string;
  value: number;
  destaque?: boolean;
};

type Props = {
  total: number;
  concluidas: number;
  canceladas: number;
  andamento: number;
  pendentes: number;
  urgentes: number;
  atrasadas: number;
};

export function KpiCards({
  total,
  concluidas,
  canceladas,
  andamento,
  pendentes,
  urgentes,
  atrasadas,
}: Props) {
  const kpis: Kpi[] = [
    { label: "Total de tarefas", value: total },
    { label: "Concluídas", value: concluidas },
    { label: "Em andamento", value: andamento },
    { label: "Pendentes", value: pendentes },
    { label: "Urgentes", value: urgentes },
    { label: "Atrasadas", value: atrasadas, destaque: atrasadas > 0 },
    ...(canceladas > 0 ? [{ label: "Canceladas", value: canceladas }] : []),
  ];

  return (
    <div
      className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${kpis.length > 6 ? "lg:grid-cols-7" : "lg:grid-cols-6"}`}
    >
      {kpis.map((k) => (
        <div
          key={k.label}
          className={
            k.destaque
              ? "bg-destructive/10 border-destructive/40 rounded-xl border p-4 text-center"
              : "bg-brand-cream border-brand-border rounded-xl border p-4 text-center"
          }
        >
          <div
            className={
              k.destaque
                ? "text-destructive text-3xl font-bold"
                : "text-brand-green text-3xl font-bold"
            }
          >
            {k.value}
          </div>
          <div
            className={
              k.destaque
                ? "text-destructive mt-1 text-xs font-semibold"
                : "text-muted-foreground mt-1 text-xs font-medium"
            }
          >
            {k.label}
          </div>
        </div>
      ))}
    </div>
  );
}
