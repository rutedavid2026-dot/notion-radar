import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { z } from "zod";
import { getDemandas } from "@/lib/notion.functions";
import { getHistoricoSemana } from "@/lib/sheets.functions";
import {
  applyFilters,
  brToIso,
  currentWeekNumber,
  statusBucket,
  uniqueSorted,
  weekRange,
  SEMANA_TODAS,
  type Filters,
} from "@/lib/report-utils";
import { ReportHeader } from "@/components/report/ReportHeader";
import { KpiCards } from "@/components/report/KpiCards";
import { Charts } from "@/components/report/Charts";
import { DemandasTable } from "@/components/report/DemandasTable";
import { PrioridadesList } from "@/components/report/PrioridadesList";
import { GlobalFilters } from "@/components/report/GlobalFilters";

const demandasQueryOptions = queryOptions({
  queryKey: ["notion", "demandas"],
  queryFn: () => getDemandas(),
  staleTime: 60_000,
});

const historicoQueryOptions = (semanaInicio: string) =>
  queryOptions({
    queryKey: ["sheets", "historico", semanaInicio],
    queryFn: () => getHistoricoSemana({ data: { semanaInicio } }),
    staleTime: 60_000,
  });

// Fica como string crua (dd-mm-aaaa, "todas" ou "") no estado de busca — não
// converte para ISO aqui. Se convertesse aqui, o TanStack Router serializaria o
// valor JÁ TRANSFORMADO de volta na URL, trocando "27-12-2025" por "2025-12-27"
// (formato que o próprio schema rejeitaria numa próxima validação, quebrando a
// página). A conversão pra ISO acontece só no ponto de uso, com `brToIso`.
const dateBrOrTodas = z
  .string()
  .optional()
  .default("")
  .refine(
    (v) => v === "" || v === SEMANA_TODAS || /^\d{2}-\d{2}-\d{4}$/.test(v),
    "formato esperado dd-mm-aaaa",
  );

const searchSchema = z.object({
  condominio: z.string().optional().default(""),
  semanainicio: dateBrOrTodas,
  semanafim: dateBrOrTodas,
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
        content:
          "Relatório semanal de demandas do condomínio Miragio Cacupé, com KPIs, gráficos e detalhamento em tempo real via Notion.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(demandasQueryOptions),
  component: ReportPage,
});

function ReportPage() {
  const { data: result } = useSuspenseQuery(demandasQueryOptions);
  const search = Route.useSearch();
  const filters: Filters = useMemo(
    () => ({
      condominio: search.condominio,
      responsavel: search.responsavel,
      status: search.status,
    }),
    [search.condominio, search.responsavel, search.status],
  );

  const allRows = result.data;

  const isTodas = search.semanainicio === SEMANA_TODAS;
  const currentRange = useMemo(() => weekRange(currentWeekNumber()), []);
  const resolvedStart = isTodas
    ? null
    : search.semanainicio
      ? brToIso(search.semanainicio)
      : currentRange.start;
  const resolvedEnd = isTodas
    ? null
    : search.semanafim
      ? brToIso(search.semanafim)
      : currentRange.end;

  const historicoQuery = useQuery({
    ...historicoQueryOptions(resolvedStart ?? ""),
    enabled: !!resolvedStart,
  });

  const usaFotografia = !isTodas && (historicoQuery.data?.data.length ?? 0) > 0;
  const baseRows = usaFotografia ? historicoQuery.data!.data : allRows;

  const condominios = useMemo(() => uniqueSorted(allRows.map((r) => r.condominio)), [allRows]);
  const responsaveis = useMemo(() => uniqueSorted(allRows.map((r) => r.responsavel)), [allRows]);
  const statuses = useMemo(() => uniqueSorted(allRows.map((r) => r.status)), [allRows]);

  const filtered = useMemo(() => applyFilters(baseRows, filters), [baseRows, filters]);

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

  const ultimaAtualizacaoLive = useMemo(() => {
    if (allRows.length === 0) return null;
    return allRows.reduce(
      (max, r) => (r.ultimaAtualizacao > max ? r.ultimaAtualizacao : max),
      allRows[0].ultimaAtualizacao,
    );
  }, [allRows]);

  const ultimaAtualizacaoExibida = usaFotografia
    ? (historicoQuery.data?.capturadoEm ?? null)
    : ultimaAtualizacaoLive;

  const resumo = buildResumo(kpis, !isTodas);

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
          semanaInicio={resolvedStart}
          semanaFim={resolvedEnd}
          ultimaAtualizacao={ultimaAtualizacaoExibida}
          resumo={resumo}
          congelado={usaFotografia}
        />

        <GlobalFilters
          search={search}
          condominios={condominios}
          responsaveis={responsaveis}
          statuses={statuses}
        />

        <KpiCards {...kpis} />

        <Charts rows={filtered} allRows={allRows} />

        <PrioridadesList rows={filtered} />

        <DemandasTable rows={filtered} />

        <footer className="text-muted-foreground pt-4 text-center text-xs">
          {usaFotografia
            ? "Dados congelados na fotografia semanal (Google Sheets)."
            : "Dados consumidos em tempo real via Notion API."}
        </footer>
      </div>
    </main>
  );
}

function buildResumo(
  k: { total: number; concluidas: number; andamento: number; pendentes: number; urgentes: number },
  temPeriodo: boolean,
): string {
  if (k.total === 0) {
    return "Sem demandas registradas para os filtros selecionados.";
  }
  const escopo = temPeriodo ? "nesta semana" : "no período consolidado";
  const parts = [
    `${k.total} demanda${k.total === 1 ? "" : "s"} ${escopo}`,
    `${k.concluidas} concluída${k.concluidas === 1 ? "" : "s"}`,
    `${k.andamento} em andamento`,
    `${k.pendentes} pendente${k.pendentes === 1 ? "" : "s"}`,
  ];
  if (k.urgentes > 0) parts.push(`${k.urgentes} urgente${k.urgentes === 1 ? "" : "s"} em aberto`);
  return parts.join(" · ") + ".";
}
