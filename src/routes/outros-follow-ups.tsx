import { useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { getOutrosFollowUps, type OutroFollowUpEntry } from "@/lib/sheets.functions";
import { formatDatePt } from "@/lib/report-utils";
import { pageMeta } from "@/lib/page-meta";
import { requireAuth } from "@/lib/auth.functions";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Masthead } from "@/components/report/Masthead";

const outrosFollowUpsQueryOptions = queryOptions({
  queryKey: ["sheets", "outros-follow-ups"],
  queryFn: () => getOutrosFollowUps(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/outros-follow-ups")({
  beforeLoad: requireAuth,
  head: () => ({
    meta: pageMeta(
      "Equipe Síndicas — Outros Follow-ups",
      "Links de relatórios de acompanhamento que não são o follow-up semanal padrão.",
    ),
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(outrosFollowUpsQueryOptions),
  component: OutrosFollowUpsPage,
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

function OutrosFollowUpsPage() {
  const { data: result } = useSuspenseQuery(outrosFollowUpsQueryOptions);

  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 md:px-8 md:py-10">
        <Masthead condominio="" />

        {result.data.length === 0 ? (
          <div className="bg-card rounded-xl border p-6 shadow-sm">
            <p className="text-muted-foreground text-sm">
              {result.error ?? "Nenhum follow-up cadastrado ainda na planilha."}
            </p>
          </div>
        ) : (
          <>
            {/* Tabela — telas médias/grandes */}
            <div className="bg-card hidden rounded-xl border p-6 shadow-sm md:block">
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
                    <TableRow key={`${entry.nome}-${entry.semana}`}>
                      <TableCell className="text-foreground font-medium">{entry.nome}</TableCell>
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
            <ul className="space-y-4 md:hidden">
              {result.data.map((entry) => (
                <li key={`${entry.nome}-${entry.semana}`}>
                  <OutroFollowUpCard entry={entry} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}

function OutroFollowUpCard({ entry }: { entry: OutroFollowUpEntry }) {
  return (
    <div className="bg-card space-y-3 rounded-xl border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-foreground font-medium">{entry.nome}</p>
        <span className="bg-brand-green/10 text-brand-green shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold">
          Semana {entry.semana}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">
        {formatDatePt(entry.dataInicio)} a {formatDatePt(entry.dataTermino)}
      </p>
      <a
        href={entry.linkFollowUp}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-green hover:text-brand-green/80 block text-sm break-all underline-offset-2 hover:underline"
      >
        {entry.linkFollowUp}
      </a>
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
