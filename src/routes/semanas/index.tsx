import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { listSemanas } from "@/lib/semanas.functions";
import { formatDatePt } from "@/lib/report-utils";

const semanasQueryOptions = queryOptions({
  queryKey: ["notion", "semanas"],
  queryFn: () => listSemanas(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/semanas/")({
  head: () => ({
    meta: [{ title: "Semanas Anteriores — Miragio Cacupé" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(semanasQueryOptions),
  component: SemanasIndexPage,
});

function SemanasIndexPage() {
  const { data: result } = useSuspenseQuery(semanasQueryOptions);

  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 md:px-8 md:py-10">
        <Link
          to="/"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao relatório
        </Link>

        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">Semanas anteriores</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Registros congelados de cada semana salva a partir do relatório.
          </p>
        </div>

        {result.error && <p className="text-destructive text-sm">{result.error}</p>}

        {result.data.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            Nenhuma semana salva ainda. Use o botão "Salvar semana" no relatório para criar a
            primeira.
          </p>
        ) : (
          <div className="grid gap-3">
            {result.data.map((s) => (
              <Link
                key={s.id}
                to="/semanas/$semanaId"
                params={{ semanaId: s.id }}
                className="bg-card hover:bg-muted/50 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 shadow-sm transition"
              >
                <div className="flex items-center gap-3">
                  <CalendarClock className="text-primary h-5 w-5 shrink-0" />
                  <div>
                    <div className="text-foreground text-sm font-semibold">{s.label}</div>
                    <div className="text-muted-foreground text-xs">
                      Salva em {formatDatePt(s.criadaEm)}
                    </div>
                  </div>
                </div>
                <div className="text-muted-foreground flex gap-4 text-xs">
                  <span>{s.total} total</span>
                  <span>{s.concluidas} concluídas</span>
                  <span>{s.urgentes} urgentes</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
