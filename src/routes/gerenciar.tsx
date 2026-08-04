import { useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { getFollowUps, type FollowUpEntry } from "@/lib/sheets.functions";
import { formatDatePt } from "@/lib/report-utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

const followUpsQueryOptions = queryOptions({
  queryKey: ["sheets", "follow-ups"],
  queryFn: () => getFollowUps(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/gerenciar")({
  head: () => ({
    meta: [
      { title: "Equipe Síndicas — Gerenciar Follow-ups" },
      {
        name: "description",
        content: "Links dos relatórios semanais de cada condomínio, por semana.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(followUpsQueryOptions),
  component: GerenciarPage,
});

function CopyLinkButton({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
    >
      {copiado ? "Copiado!" : "Copiar link"}
    </Button>
  );
}

function GerenciarPage() {
  const { data: result } = useSuspenseQuery(followUpsQueryOptions);

  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 md:px-8 md:py-10">
        <header className="border-brand-maroon overflow-hidden rounded-2xl border-t-4 shadow-sm">
          <div className="bg-brand-cream flex">
            <div className="bg-brand-green w-3 shrink-0" />
            <div className="flex-1 px-6 py-5 md:px-8">
              <p className="text-brand-green text-2xl font-bold tracking-tight md:text-3xl">
                EQUIPE SÍNDICAS
              </p>
              <p className="text-brand-green/70 mt-1 text-xs font-semibold tracking-[0.2em] uppercase">
                Gerenciar Follow-ups
              </p>
            </div>
          </div>
        </header>

        <div className="bg-card rounded-xl border p-6 shadow-sm">
          {result.data.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {result.error ?? "Nenhum follow-up cadastrado ainda na planilha."}
            </p>
          ) : (
            <>
              {/* Tabela — telas médias/grandes */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Semana</TableHead>
                      <TableHead>Datas</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead className="text-right">Copiar Link</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.data.map((entry) => (
                      <TableRow key={`${entry.condominio}-${entry.semana}`}>
                        <TableCell className="text-foreground font-medium">
                          {entry.condominio}
                        </TableCell>
                        <TableCell>{entry.semana}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDatePt(entry.dataInicio)} a {formatDatePt(entry.dataTermino)}
                        </TableCell>
                        <TableCell>
                          <a
                            href={entry.linkFollowUp}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-green hover:text-brand-green/80 break-all underline-offset-2 hover:underline"
                          >
                            {entry.linkFollowUp}
                          </a>
                        </TableCell>
                        <TableCell className="text-right">
                          <CopyLinkButton url={entry.linkFollowUp} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Cards — telas pequenas (a URL crua não cabe numa coluna estreita) */}
              <ul className="divide-y md:hidden">
                {result.data.map((entry) => (
                  <li key={`${entry.condominio}-${entry.semana}`}>
                    <FollowUpCard entry={entry} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function FollowUpCard({ entry }: { entry: FollowUpEntry }) {
  return (
    <div className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <p className="text-foreground font-medium">{entry.condominio}</p>
        <span className="bg-brand-green/10 text-brand-green shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold">
          Semana {entry.semana}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">
        {formatDatePt(entry.dataInicio)} a {formatDatePt(entry.dataTermino)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild type="button" variant="outline" size="sm">
          <a href={entry.linkFollowUp} target="_blank" rel="noopener noreferrer">
            Abrir relatório →
          </a>
        </Button>
        <CopyLinkButton url={entry.linkFollowUp} />
      </div>
    </div>
  );
}
