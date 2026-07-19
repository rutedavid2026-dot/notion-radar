import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { z } from "zod";
import { getDemandas } from "@/lib/notion.functions";
import { getHistoricoSemana, getSemanasDisponiveis } from "@/lib/sheets.functions";
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
import { Masthead } from "@/components/report/Masthead";
import { ReportHeader } from "@/components/report/ReportHeader";
import { KpiCards } from "@/components/report/KpiCards";
import { Charts } from "@/components/report/Charts";
import { ResumoExecutivo } from "@/components/report/ResumoExecutivo";
import { DemandaSectionTable } from "@/components/report/DemandaSectionTable";
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

const semanasQueryOptions = queryOptions({
  queryKey: ["sheets", "semanas"],
  queryFn: () => getSemanasDisponiveis(),
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
  const currentWeekN = useMemo(() => currentWeekNumber(), []);
  const currentRange = useMemo(() => weekRange(currentWeekN), [currentWeekN]);
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

  const semanasQuery = useQuery(semanasQueryOptions);

  // O dropdown só deve oferecer semanas que já têm fotografia na planilha —
  // exceto a semana atual (calculada pela âncora), que sempre entra na lista
  // mesmo sem fotografia ainda, pra sempre haver uma opção "selecionada" no
  // primeiro acesso (antes da captura de sexta-feira).
  const weekOptions = useMemo(() => {
    const list = semanasQuery.data ?? [];
    if (list.some((w) => w.n === currentWeekN)) return list;
    return [...list, { n: currentWeekN, ...currentRange }].sort((a, b) => a.n - b.n);
  }, [semanasQuery.data, currentWeekN, currentRange]);

  // Enquanto uma semana recém-selecionada ainda está sendo buscada na
  // planilha (chave de query nova, sem dado em cache), mostra um estado de
  // carregamento em vez de piscar os dados ao vivo da semana anterior.
  const isLoadingFoto = historicoQuery.isLoading;
  const usaFotografia = !isTodas && (historicoQuery.data?.data.length ?? 0) > 0;
  const baseRows = useMemo(
    () => (isLoadingFoto ? [] : usaFotografia ? historicoQuery.data!.data : allRows),
    [isLoadingFoto, usaFotografia, historicoQuery.data, allRows],
  );

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

  const altas = useMemo(
    () => filtered.filter((r) => r.prioridade === "Alta" && r.status !== "Concluído").length,
    [filtered],
  );

  const abertas = useMemo(() => filtered.filter((r) => r.status !== "Concluído"), [filtered]);
  const prioritarias = useMemo(
    () => abertas.filter((r) => r.prioridade === "Urgente" || r.prioridade === "Alta"),
    [abertas],
  );
  const operacionais = useMemo(
    () => abertas.filter((r) => r.prioridade !== "Urgente" && r.prioridade !== "Alta"),
    [abertas],
  );

  const condominioLabel =
    filters.condominio || (condominios.length === 1 ? condominios[0] : "Todos os condomínios");

  const ultimaAtualizacaoLive = useMemo(() => {
    if (allRows.length === 0) return null;
    return allRows.reduce(
      (max, r) => (r.ultimaAtualizacao > max ? r.ultimaAtualizacao : max),
      allRows[0].ultimaAtualizacao,
    );
  }, [allRows]);

  const referencia = usaFotografia
    ? (historicoQuery.data?.capturadoEm ?? null)
    : ultimaAtualizacaoLive;

  const descricao = `Este follow-up apresenta a leitura consolidada das demandas do ${condominioLabel}, com foco em demanda, data de criação, status e última ação registrada. Foram consideradas ${kpis.total} tarefa${kpis.total === 1 ? "" : "s"} no total; as concluídas aparecem nos gráficos e totais, e o detalhamento operacional prioriza as demandas ainda em movimento.`;

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

        <Masthead condominio={condominioLabel} />

        <ReportHeader
          condominio={condominioLabel}
          semanaInicio={resolvedStart}
          semanaFim={resolvedEnd}
          referencia={referencia}
          descricao={descricao}
          congelado={usaFotografia}
        />

        <GlobalFilters
          search={search}
          weekOptions={weekOptions}
          condominios={condominios}
          responsaveis={responsaveis}
          statuses={statuses}
        />

        {isLoadingFoto ? (
          <div className="bg-card text-muted-foreground flex flex-col items-center justify-center gap-3 rounded-xl border py-16">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Carregando fotografia da semana selecionada…</p>
          </div>
        ) : (
          <>
            <KpiCards {...kpis} />

            <Charts rows={filtered} allRows={allRows} />

            <ResumoExecutivo
              emMovimento={kpis.andamento + kpis.pendentes}
              urgentes={kpis.urgentes}
              altas={altas}
            />

            <DemandaSectionTable
              title="Demandas em aberto - prioridade urgente e alta"
              description="Detalhamento das demandas que exigem acompanhamento mais próximo. As demandas concluídas não foram detalhadas nesta seção."
              rows={prioritarias}
            />

            <DemandaSectionTable
              title="Demandas em aberto - acompanhamento operacional"
              description="Demais demandas em andamento, não iniciadas, agendadas ou aguardando providências."
              rows={operacionais}
            />
          </>
        )}

        <footer className="border-brand-border flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs">
          <span className="text-muted-foreground">
            Equipe Síndicas Profissionais | Follow-up Semanal
          </span>
          <span className="text-muted-foreground">
            {usaFotografia
              ? "Dados congelados na fotografia semanal (Google Sheets)."
              : "Dados consumidos em tempo real via Notion API."}
          </span>
        </footer>
      </div>
    </main>
  );
}
