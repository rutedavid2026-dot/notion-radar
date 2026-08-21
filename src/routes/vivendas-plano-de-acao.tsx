import { useMemo, useState } from "react";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import {
  getPlanoDeAcaoVivendasSemana,
  getPlanoDeAcaoVivendasSemanasDisponiveis,
  type PlanoDeAcaoItem,
} from "@/lib/sheets.functions";
import {
  brToIso,
  currentWeekNumber,
  formatDatePt,
  statusBucket,
  uniqueSorted,
  weekRange,
  SEMANA_TODAS,
} from "@/lib/report-utils";
import { Masthead } from "@/components/report/Masthead";
import { ReportHeader } from "@/components/report/ReportHeader";
import { pageMeta } from "@/lib/page-meta";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const semanasQueryOptions = queryOptions({
  queryKey: ["sheets", "plano-de-acao-vivendas", "semanas"],
  queryFn: () => getPlanoDeAcaoVivendasSemanasDisponiveis(),
  staleTime: 60_000,
});

const planoQueryOptions = (semanaInicio: string) =>
  queryOptions({
    queryKey: ["sheets", "plano-de-acao-vivendas", semanaInicio],
    queryFn: () => getPlanoDeAcaoVivendasSemana({ data: { semanaInicio } }),
    staleTime: 60_000,
  });

// Mesmo formato dd-mm-aaaa (ou "todas") usado em $condominio.tsx — a
// conversão pra ISO só acontece no ponto de uso (ver comentário lá).
const dateBrOrTodas = z
  .string()
  .optional()
  .default("")
  .refine(
    (v) => v === "" || v === SEMANA_TODAS || /^\d{2}-\d{2}-\d{4}$/.test(v),
    "formato esperado dd-mm-aaaa",
  );

const searchSchema = z.object({
  semanainicio: dateBrOrTodas,
  semanafim: dateBrOrTodas,
});

export const Route = createFileRoute("/vivendas-plano-de-acao")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: pageMeta(
      "Plano de Ação — Vivendas",
      "Plano de ação de manutenção/obra da Vivendas, derivado do laudo de vistoria.",
    ),
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(semanasQueryOptions),
  component: PlanoDeAcaoPage,
});

const ALL = "__todos__";

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </div>
  );
}

function statusBadgeClass(status: string): string {
  switch (statusBucket(status)) {
    case "concluido":
      return "bg-emerald-100 text-emerald-800";
    case "cancelado":
      return "bg-muted text-muted-foreground";
    case "andamento":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function PlanoDeAcaoPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const isTodas = search.semanainicio === SEMANA_TODAS;
  const currentWeekN = useMemo(() => currentWeekNumber(), []);
  const currentRange = useMemo(() => weekRange(currentWeekN), [currentWeekN]);
  const resolvedStart = search.semanainicio ? brToIso(search.semanainicio) : currentRange.start;
  const resolvedEnd = search.semanafim ? brToIso(search.semanafim) : currentRange.end;

  const semanasQuery = useSuspenseQuery(semanasQueryOptions);
  const weekOptions = useMemo(() => {
    const list = semanasQuery.data;
    if (list.some((w) => w.n === currentWeekN)) return list;
    return [...list, { n: currentWeekN, ...currentRange }].sort((a, b) => a.n - b.n);
  }, [semanasQuery.data, currentWeekN, currentRange]);

  const planoQuery = useQuery({
    ...planoQueryOptions(resolvedStart),
    enabled: !isTodas,
  });

  const [statusFiltro, setStatusFiltro] = useState(ALL);
  const [prioridadeFiltro, setPrioridadeFiltro] = useState(ALL);
  const [areaFiltro, setAreaFiltro] = useState(ALL);

  const allRows = useMemo(
    () =>
      (planoQuery.data?.data ?? []).map((r) => ({
        ...r,
        status: r.status.charAt(0).toUpperCase() + r.status.slice(1),
      })),
    [planoQuery.data],
  );

  const statuses = useMemo(() => uniqueSorted(allRows.map((r) => r.status)), [allRows]);
  const prioridades = useMemo(() => uniqueSorted(allRows.map((r) => r.prioridade)), [allRows]);
  const areas = useMemo(() => uniqueSorted(allRows.map((r) => r.area)), [allRows]);

  const filtered = useMemo(
    () =>
      allRows
        .filter(
          (r) =>
            (statusFiltro === ALL || r.status === statusFiltro) &&
            (prioridadeFiltro === ALL || r.prioridade === prioridadeFiltro) &&
            (areaFiltro === ALL || r.area === areaFiltro),
        )
        .sort((a, b) => a.acao.localeCompare(b.acao, "pt-BR")),
    [allRows, statusFiltro, prioridadeFiltro, areaFiltro],
  );

  const isLoading = !isTodas && planoQuery.isLoading;

  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8 md:py-10">
        <Link
          to="/"
          className="text-muted-foreground hover:text-brand-green inline-flex items-center gap-1 text-sm transition-colors"
        >
          ← Voltar ao menu
        </Link>

        <Masthead condominio="" />

        <ReportHeader
          condominio="Vivendas"
          semanaInicio={isTodas ? null : resolvedStart}
          semanaFim={isTodas ? null : resolvedEnd}
          referencia={planoQuery.data?.capturadoEm ?? null}
          descricao="Plano de ação de manutenção/obra, derivado do laudo de vistoria."
          titulo="Plano de Ação"
        />

        <div className="bg-card flex flex-wrap gap-4 rounded-xl border p-4 shadow-sm">
          <FilterBlock label="Semana">
            <Select
              value={String(
                weekOptions.find((w) => w.start === resolvedStart)?.n ?? currentWeekN,
              )}
              onValueChange={(v) => {
                const w = weekOptions.find((o) => o.n === Number(v));
                if (!w) return;
                navigate({
                  search: (prev) => ({
                    ...prev,
                    semanainicio: w.start.split("-").reverse().join("-"),
                    semanafim: w.end.split("-").reverse().join("-"),
                  }),
                });
              }}
            >
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {weekOptions.map((w) => (
                  <SelectItem key={w.n} value={String(w.n)}>
                    Semana {w.n} — {formatDatePt(w.start)} a {formatDatePt(w.end)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterBlock>

          <FilterBlock label="Status">
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterBlock>

          <FilterBlock label="Prioridade">
            <Select value={prioridadeFiltro} onValueChange={setPrioridadeFiltro}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {prioridades.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterBlock>

          <FilterBlock label="Área">
            <Select value={areaFiltro} onValueChange={setAreaFiltro}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterBlock>
        </div>

        {isLoading ? (
          <div className="bg-card rounded-xl border p-6 shadow-sm">
            <p className="text-muted-foreground text-sm">Carregando…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card rounded-xl border p-6 shadow-sm">
            <p className="text-muted-foreground text-sm">
              Nenhuma ação encontrada pra essa semana/filtro.
            </p>
          </div>
        ) : (
          <>
            {/* Tabela — telas médias/grandes */}
            <div className="bg-card hidden overflow-x-auto rounded-xl border p-6 shadow-sm md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ação</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead>Prazo - Conclusão</TableHead>
                    <TableHead>Risco</TableHead>
                    <TableHead>Referência</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-foreground max-w-xs font-medium">
                        {item.acao}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(item.status)}`}
                        >
                          {item.status || "—"}
                        </span>
                      </TableCell>
                      <TableCell>{item.prioridade || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{item.area || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.prazoConclusao ? formatDatePt(item.prazoConclusao) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-xs">
                        {item.risco || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.referenciaRelatorio || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Cards — telas pequenas */}
            <ul className="space-y-4 md:hidden">
              {filtered.map((item) => (
                <li key={item.id}>
                  <PlanoDeAcaoCard item={item} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}

function PlanoDeAcaoCard({ item }: { item: PlanoDeAcaoItem }) {
  return (
    <div className="bg-card space-y-2 rounded-xl border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-foreground font-medium">{item.acao}</p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(item.status)}`}
        >
          {item.status || "—"}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">
        Prioridade: <span className="text-foreground">{item.prioridade || "—"}</span> · Área:{" "}
        <span className="text-foreground">{item.area || "—"}</span>
      </p>
      {item.prazoConclusao && (
        <p className="text-muted-foreground text-sm">
          Prazo de conclusão: {formatDatePt(item.prazoConclusao)}
        </p>
      )}
      {item.risco && <p className="text-muted-foreground text-sm">Risco: {item.risco}</p>}
      {item.referenciaRelatorio && (
        <p className="text-muted-foreground text-xs">Ref.: {item.referenciaRelatorio}</p>
      )}
    </div>
  );
}
