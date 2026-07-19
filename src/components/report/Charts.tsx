import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import type { Demanda } from "@/lib/notion.functions";
import { addDays, mondayOf, formatDatePt } from "@/lib/report-utils";

const STATUS_COLORS: Record<string, string> = {
  Concluído: "#10b981",
  "Em andamento": "#3b82f6",
  "Não iniciado": "#94a3b8",
  Agendado: "#8b5cf6",
  Orçamento: "#eab308",
  Aguardando: "#f97316",
};

const BAR_COLOR = "#6366f1";
const LINE_COLOR = "#8b5cf6";

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border p-5 shadow-sm">
      <h3 className="text-foreground text-sm font-semibold">{title}</h3>
      <div className="mt-4 h-[260px] w-full">{children}</div>
    </div>
  );
}

export function Charts({ rows, allRows }: { rows: Demanda[]; allRows: Demanda[] }) {
  const statusData = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => map.set(r.status, (map.get(r.status) ?? 0) + 1));
    return Array.from(map, ([name, value]) => ({ name, value }));
  }, [rows]);

  const responsavelData = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => map.set(r.responsavel, (map.get(r.responsavel) ?? 0) + 1));
    return Array.from(map, ([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  }, [rows]);

  const categoriaData = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => map.set(r.area, (map.get(r.area) ?? 0) + 1));
    return Array.from(map, ([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  }, [rows]);

  const evolucaoData = useMemo(() => {
    // Last 8 weeks based on today
    const today = new Date();
    const currentMonday = mondayOf(today.toISOString());
    const weeks: { semana: string; label: string; total: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const wk = addDays(currentMonday, -7 * i);
      weeks.push({ semana: wk, label: formatDatePt(wk).slice(0, 5), total: 0 });
    }
    allRows.forEach((r) => {
      if (!r.criadaEm) return;
      const wk = mondayOf(r.criadaEm);
      const w = weeks.find((x) => x.semana === wk);
      if (w) w.total += 1;
    });
    return weeks;
  }, [allRows]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Status das demandas">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={statusData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={90}
              label={(entry) => `${entry.value}`}
            >
              {statusData.map((entry) => (
                <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#64748b"} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Demandas por responsável">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={responsavelData} layout="vertical" margin={{ left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="total" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Demandas por categoria">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={categoriaData} margin={{ bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              angle={-25}
              textAnchor="end"
              height={60}
            />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="total" fill={BAR_COLOR} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Evolução semanal (últimas 8 semanas)">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={evolucaoData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="total"
              stroke={LINE_COLOR}
              strokeWidth={2.5}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
