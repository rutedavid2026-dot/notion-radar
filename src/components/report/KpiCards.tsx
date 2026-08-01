type Kpi = {
  label: string;
  value: number;
};

type Props = {
  total: number;
  concluidas: number;
  canceladas: number;
  andamento: number;
  pendentes: number;
  urgentes: number;
};

export function KpiCards({ total, concluidas, canceladas, andamento, pendentes, urgentes }: Props) {
  const kpis: Kpi[] = [
    { label: "Total de demandas", value: total },
    { label: "Concluídas", value: concluidas },
    { label: "Em andamento", value: andamento },
    { label: "Pendentes", value: pendentes },
    { label: "Urgentes", value: urgentes },
    ...(canceladas > 0 ? [{ label: "Canceladas", value: canceladas }] : []),
  ];

  return (
    <div
      className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${kpis.length > 5 ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}
    >
      {kpis.map((k) => (
        <div
          key={k.label}
          className="bg-brand-cream border-brand-border rounded-xl border p-4 text-center"
        >
          <div className="text-brand-green text-3xl font-bold">{k.value}</div>
          <div className="text-muted-foreground mt-1 text-xs font-medium">{k.label}</div>
        </div>
      ))}
    </div>
  );
}
