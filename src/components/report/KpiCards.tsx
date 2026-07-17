import { AlertTriangle, CheckCircle2, Clock, ListTodo, Loader2 } from "lucide-react";

type Kpi = {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
};

type Props = {
  total: number;
  concluidas: number;
  andamento: number;
  pendentes: number;
  urgentes: number;
};

export function KpiCards({ total, concluidas, andamento, pendentes, urgentes }: Props) {
  const kpis: Kpi[] = [
    {
      label: "Total de demandas",
      value: total,
      icon: <ListTodo className="h-5 w-5" />,
      tone: "bg-primary/10 text-primary",
    },
    {
      label: "Concluídas",
      value: concluidas,
      icon: <CheckCircle2 className="h-5 w-5" />,
      tone: "bg-emerald-500/10 text-emerald-600",
    },
    {
      label: "Em andamento",
      value: andamento,
      icon: <Loader2 className="h-5 w-5" />,
      tone: "bg-blue-500/10 text-blue-600",
    },
    {
      label: "Pendentes",
      value: pendentes,
      icon: <Clock className="h-5 w-5" />,
      tone: "bg-amber-500/10 text-amber-600",
    },
    {
      label: "Urgentes",
      value: urgentes,
      icon: <AlertTriangle className="h-5 w-5" />,
      tone: "bg-red-500/10 text-red-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {kpis.map((k) => (
        <div
          key={k.label}
          className="bg-card rounded-xl border p-4 shadow-sm transition hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">{k.label}</span>
            <span className={`rounded-lg p-2 ${k.tone}`}>{k.icon}</span>
          </div>
          <div className="text-foreground mt-3 text-3xl font-bold">{k.value}</div>
        </div>
      ))}
    </div>
  );
}
