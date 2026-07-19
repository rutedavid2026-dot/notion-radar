import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Demanda } from "@/lib/notion.functions";
import { addDays, mondayOf, formatDatePt, normalizeForMatch } from "@/lib/report-utils";

// Ordem igual ao PDF (Concluído, Em andamento, Não iniciado, Agendado,
// Aguardando); "Orçamento" não existe no template do PDF, entra no fim.
const STATUS_COLORS: Record<string, string> = {
  Concluído: "#173F35",
  "Em andamento": "#2E5D7A",
  "Não iniciado": "#C66A2E",
  Agendado: "#7A2E3A",
  Aguardando: "#727272",
  Orçamento: "#8A6D3B",
};
const STATUS_ORDER = Object.keys(STATUS_COLORS);

// O Notion às vezes tem grafias divergentes pro mesmo status (ex.: "Nao
// iniciado" sem acento cadastrado à parte de "Não iniciado") — normaliza pro
// rótulo canônico conhecido antes de agrupar, pra não duplicar barra no
// gráfico. Fora daqui (tabelas, badges) o valor bruto continua sendo exibido.
const CANONICAL_STATUS = new Map(
  Object.keys(STATUS_COLORS).map((label) => [normalizeForMatch(label), label]),
);
function canonicalStatus(status: string): string {
  return CANONICAL_STATUS.get(normalizeForMatch(status)) ?? status;
}

const PRIORIDADE_ORDER = ["Urgente", "Alta", "Média"] as const;
const PRIORIDADE_COLORS: Record<string, string> = {
  Urgente: "#7A2E3A",
  Alta: "#C66A2E",
  Média: "#173F35",
};

const BAR_COLOR = "#173F35";
const LINE_COLOR = "#7A2E3A";

function ChartCard({
  title,
  height = 260,
  children,
}: {
  title: string;
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-xl border p-5 shadow-sm">
      <h3 className="text-foreground text-sm font-semibold">{title}</h3>
      <div className="mt-4 w-full" style={{ height }}>
        {children}
      </div>
    </div>
  );
}

// Tick customizado pro eixo de categorias (nomes de responsável) — o tick
// padrão do recharts quebra rótulos com espaço em múltiplas linhas quando
// não cabem na largura, o que sobrepõe o texto da barra vizinha quando há
// muitas categorias. Renderiza sempre uma linha só, truncando com "…".
type CategoryTickProps = { x?: number; y?: number; payload?: { value: string } };
function TruncatedCategoryTick({ x = 0, y = 0, payload }: CategoryTickProps) {
  const label = payload?.value ?? "";
  const truncated = label.length > 20 ? `${label.slice(0, 19)}…` : label;
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill="#6b7280">
      {truncated}
    </text>
  );
}

function MiniChart({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground text-center text-sm">{title}</p>
      <div className="mt-2 h-[240px] w-full">{children}</div>
    </div>
  );
}

export function Charts({ rows, allRows }: { rows: Demanda[]; allRows: Demanda[] }) {
  const statusData = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      const status = canonicalStatus(r.status);
      map.set(status, (map.get(status) ?? 0) + 1);
    });
    return Array.from(map, ([name, total]) => ({ name, total })).sort((a, b) => {
      const ia = STATUS_ORDER.indexOf(a.name);
      const ib = STATUS_ORDER.indexOf(b.name);
      return (ia === -1 ? STATUS_ORDER.length : ia) - (ib === -1 ? STATUS_ORDER.length : ib);
    });
  }, [rows]);

  const prioridadeData = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      if (PRIORIDADE_ORDER.includes(r.prioridade as (typeof PRIORIDADE_ORDER)[number])) {
        map.set(r.prioridade, (map.get(r.prioridade) ?? 0) + 1);
      }
    });
    return PRIORIDADE_ORDER.map((name) => ({ name, total: map.get(name) ?? 0 }));
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
    <div className="space-y-4">
      <div>
        <h2 className="text-brand-green text-lg font-bold tracking-tight">
          Gráficos de acompanhamento
        </h2>
        <div className="border-brand-border bg-card mt-3 grid gap-6 rounded-xl border p-5 shadow-sm md:grid-cols-2">
          <MiniChart title="Tarefas por status">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} margin={{ bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  angle={-25}
                  textAnchor="end"
                  height={60}
                />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {statusData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#64748b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </MiniChart>

          <MiniChart title="Tarefas por prioridade">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={prioridadeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {prioridadeData.map((entry) => (
                    <Cell key={entry.name} fill={PRIORIDADE_COLORS[entry.name] ?? "#64748b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </MiniChart>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Demandas por responsável"
          height={Math.max(260, responsavelData.length * 32)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={responsavelData} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                interval={0}
                tick={<TruncatedCategoryTick />}
              />
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
    </div>
  );
}
