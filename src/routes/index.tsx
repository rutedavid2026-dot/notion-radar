import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertCircle, History } from "lucide-react";
import { z } from "zod";
import { getDemandas } from "@/lib/notion.functions";
import {
  applyFilters,
  addDays,
  mondayOf,
  statusBucket,
  uniqueSorted,
  type Filters,
} from "@/lib/report-utils";
import { ReportHeader } from "@/components/report/ReportHeader";
import { KpiCards } from "@/components/report/KpiCards";
import { Charts } from "@/components/report/Charts";
import { DemandasTable } from "@/components/report/DemandasTable";
import { PrioridadesList } from "@/components/report/PrioridadesList";
import { GlobalFilters } from "@/components/report/GlobalFilters";
import { SalvarSemanaButton } from "@/components/report/SalvarSemanaButton";

const demandasQueryOptions = queryOptions({
  queryKey: ["notion", "demandas"],
  queryFn: () => getDemandas(),
  staleTime: 60_000,
});

const searchSchema = z.object({
  condominio: z.string().optional().default(""),
  semana: z.string().optional().default(""),
  responsavel: z.string().optional().default(""),
  status: z.string().optional().default(""),
});

export const Route = createFileRoute("/")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Relatório Semanal — Miragio Cacupé" },
      {
        name: "description",
        content:
          "Relatório semanal de demandas do condomínio Miragio Cacupé, com KPIs, gráficos e detalhamento em tempo real via Notion.",
      },
      { property: "og:title", content: "Relatório Semanal — Miragio Cacupé" },
      {
        property: "og:description",
        content: "Acompanhamento semanal de demandas do condomínio.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(demandasQueryOptions),
  component: ReportPage,
});

function ReportPage() {
  const { data: result } = useSuspenseQuery(demandasQueryOptions);
  const search = Route.useSearch();
  const filters: Filters = search;

  const allRows = result.data;

  const condominios = useMemo(() => uniqueSorted(allRows.map((r) => r.condominio)), [allRows]);
  const responsaveis = useMemo(() => uniqueSorted(allRows.map((r) => r.responsavel)), [allRows]);
  const statuses = useMemo(() => uniqueSorted(allRows.map((r) => r.status)), [allRows]);
  const semanas = useMemo(() => {
    const wks = allRows
      .map((r) => (r.criadaEm ? mondayOf(r.criadaEm) : ""))
      .filter(Boolean);
    return Array.from(new Set(wks)).sort().reverse();
  }, [allRows]);

  const filtered = useMemo(() => applyFilters(allRows, filters), [allRows, filters]);

  const kpis = useMemo(() => {
    let concluidas = 0;
    let andamento = 0;
    let pendentes = 0;
    let urgentes = 0;
    filtered.forEach((r) => {
      const b = statusBucket(r.status);
      if (b === "concluido") concluidas += 1;
      else if (b === "andamento") andamento += 1;
      else pendentes += 1;
      if (r.prioridade === "Urgente" && r.status !== "Concluído") urgentes += 1;
    });
    return { total: filtered.length, concluidas, andamento, pendentes, urgentes };
  }, [filtered]);

  const condominioLabel =
    filters.condominio || (condominios.length === 1 ? condominios[0] : "Todos os condomínios");

  const semanaInicio = filters.semana || null;
  const semanaFim = filters.semana ? addDays(filters.semana, 6) : null;

  const ultimaAtualizacao = useMemo(() => {
    if (allRows.length === 0) return null;
    return allRows.reduce(
      (max, r) => (r.ultimaAtualizacao > max ? r.ultimaAtualizacao : max),
      allRows[0].ultimaAtualizacao,
    );
  }, [allRows]);

  const resumo = buildResumo(kpis, filters.semana);

  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-8 md:py-10">
        {result.error && (
          <div className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-3 rounded-xl border p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Não foi possível carregar os dados do Notion.</p>
              <p className="mt-1 text-xs opacity-80">{result.error}</p>
              <p className="mt-1 text-xs opacity-80">
                Verifique se a database foi compartilhada com a integração no Notion.
              </p>
            </div>
          </div>
        )}

        <ReportHeader
          condominio={condominioLabel}
          semanaInicio={semanaInicio}
          semanaFim={semanaFim}
          ultimaAtualizacao={ultimaAtualizacao}
          resumo={resumo}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/semanas"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <History className="h-4 w-4" /> Semanas anteriores
          </Link>
          <SalvarSemanaButton />
        </div>

        <GlobalFilters
          filters={filters}
          condominios={condominios}
          responsaveis={responsaveis}
          statuses={statuses}
          semanas={semanas}
        />

        <KpiCards {...kpis} />

        <Charts rows={filtered} allRows={allRows} />

        <PrioridadesList rows={filtered} />

        <DemandasTable rows={filtered} />

        <footer className="text-muted-foreground pt-4 text-center text-xs">
          Dados consumidos em tempo real via Notion API.
        </footer>
      </div>
    </main>
  );
}

function buildResumo(
  k: { total: number; concluidas: number; andamento: number; pendentes: number; urgentes: number },
  semana: string,
): string {
  if (k.total === 0) {
    return "Sem demandas registradas para os filtros selecionados.";
  }
  const escopo = semana ? "nesta semana" : "no período consolidado";
  const parts = [
    `${k.total} demanda${k.total === 1 ? "" : "s"} ${escopo}`,
    `${k.concluidas} concluída${k.concluidas === 1 ? "" : "s"}`,
    `${k.andamento} em andamento`,
    `${k.pendentes} pendente${k.pendentes === 1 ? "" : "s"}`,
  ];
  if (k.urgentes > 0) parts.push(`${k.urgentes} urgente${k.urgentes === 1 ? "" : "s"} em aberto`);
  return parts.join(" · ") + ".";
}
