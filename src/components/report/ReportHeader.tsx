import { formatDatePt, addDays } from "@/lib/report-utils";

type Props = {
  condominio: string;
  semanaInicio: string | null;
  semanaFim: string | null;
  referencia: string | null;
  descricao: string;
  congelado?: boolean;
};

export function ReportHeader({
  condominio,
  semanaInicio,
  semanaFim,
  referencia,
  descricao,
  congelado,
}: Props) {
  return (
    <header className="bg-card rounded-2xl border p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-brand-green text-2xl font-bold tracking-tight md:text-3xl">
            {condominio}
          </h1>
          {congelado && (
            <span className="bg-brand-green/10 text-brand-green rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
              Semana congelada
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          Referência:{" "}
          <span className="text-foreground font-medium">{formatDatePt(referencia)}</span>
        </p>
      </div>

      <p className="text-brand-maroon mt-1 text-base font-medium">
        Follow-up Semanal - Gestão em Movimento
      </p>

      <p className="text-muted-foreground mt-2 text-xs">
        Período:{" "}
        <span className="text-foreground font-medium">
          {semanaInicio ? formatDatePt(semanaInicio) : "—"} até{" "}
          {semanaFim
            ? formatDatePt(semanaFim)
            : semanaInicio
              ? formatDatePt(addDays(semanaInicio, 6))
              : "—"}
        </span>
        {congelado && " · Estes dados são fixos e não refletem mudanças feitas depois no Notion."}
      </p>

      <div className="border-brand-border mt-4 border-t pt-4">
        <p className="text-foreground text-sm leading-relaxed">{descricao}</p>
      </div>
    </header>
  );
}
