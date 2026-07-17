import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { getSemanaSnapshot } from "@/lib/semanas.functions";
import { formatDatePt } from "@/lib/report-utils";
import { KpiCards } from "@/components/report/KpiCards";
import { Charts } from "@/components/report/Charts";
import { DemandasTable } from "@/components/report/DemandasTable";
import { PrioridadesList } from "@/components/report/PrioridadesList";

const snapshotQueryOptions = (semanaId: string) =>
  queryOptions({
    queryKey: ["notion", "semana", semanaId],
    queryFn: () => getSemanaSnapshot({ data: semanaId }),
  });

export const Route = createFileRoute("/semanas/$semanaId")({
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.semana
          ? `${loaderData.semana.label} — Miragio Cacupé`
          : "Semana — Miragio Cacupé",
      },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(snapshotQueryOptions(params.semanaId)),
  component: SemanaDetailPage,
});

function SemanaDetailPage() {
  const { semanaId } = Route.useParams();
  const { data: result } = useSuspenseQuery(snapshotQueryOptions(semanaId));
  const semana = result.semana;
  const rows = result.data;

  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-8 md:py-10">
        <Link
          to="/semanas"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Todas as semanas
        </Link>

        {result.error && (
          <div className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-3 rounded-xl border p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">{result.error}</p>
          </div>
        )}

        {semana && (
          <header className="bg-card rounded-2xl border p-6 shadow-sm md:p-8">
            <p className="text-primary text-xs font-semibold uppercase tracking-widest">
              Semana congelada
            </p>
            <h1 className="text-foreground mt-1 text-2xl font-bold tracking-tight md:text-3xl">
              {semana.label}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Período:{" "}
              <span className="text-foreground font-medium">
                {formatDatePt(semana.dataInicio)} até {formatDatePt(semana.dataFim)}
              </span>
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Estado registrado em {formatDatePt(semana.criadaEm)} — estes dados são fixos e não
              refletem mudanças feitas depois no Notion.
            </p>
          </header>
        )}

        {semana && (
          <KpiCards
            total={semana.total}
            concluidas={semana.concluidas}
            andamento={semana.andamento}
            pendentes={semana.pendentes}
            urgentes={semana.urgentes}
          />
        )}

        {rows.length > 0 && (
          <>
            <Charts rows={rows} allRows={rows} />
            <PrioridadesList rows={rows} />
            <DemandasTable rows={rows} />
          </>
        )}
      </div>
    </main>
  );
}
