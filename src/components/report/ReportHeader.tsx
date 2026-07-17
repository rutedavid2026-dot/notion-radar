import { formatDatePt, formatDateTimePt, addDays } from "@/lib/report-utils";

type Props = {
  condominio: string;
  semanaInicio: string | null;
  semanaFim: string | null;
  ultimaAtualizacao: string | null;
  resumo: string;
};

export function ReportHeader({
  condominio,
  semanaInicio,
  semanaFim,
  ultimaAtualizacao,
  resumo,
}: Props) {
  return (
    <header className="bg-card rounded-2xl border p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-primary text-xs font-semibold uppercase tracking-widest">
            Relatório Semanal
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
            {condominio}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Período:{" "}
            <span className="text-foreground font-medium">
              {semanaInicio ? formatDatePt(semanaInicio) : "—"} até{" "}
              {semanaFim ? formatDatePt(semanaFim) : semanaInicio ? formatDatePt(addDays(semanaInicio, 6)) : "—"}
            </span>
          </p>
        </div>
        <div className="text-muted-foreground text-xs md:text-right">
          Atualizado em
          <div className="text-foreground text-sm font-medium">
            {formatDateTimePt(ultimaAtualizacao)}
          </div>
        </div>
      </div>

      <div className="bg-muted/50 mt-6 rounded-lg border p-4">
        <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Resumo Executivo
        </p>
        <p className="text-foreground mt-1.5 text-sm leading-relaxed">{resumo}</p>
      </div>
    </header>
  );
}
