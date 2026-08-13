import { LayoutDashboard } from "lucide-react";
import { formatDatePt, addDays } from "@/lib/report-utils";

type Props = {
  condominio: string;
  semanaInicio: string | null;
  semanaFim: string | null;
  referencia: string | null;
  descricao: string;
  congelado?: boolean;
  titulo?: string;
  variant?: "default" | "gerencial";
};

export function ReportHeader({
  condominio,
  semanaInicio,
  semanaFim,
  referencia,
  descricao,
  congelado,
  titulo = "Follow-up Semanal - Gestão em Movimento",
  variant = "default",
}: Props) {
  return (
    <header className="bg-card rounded-2xl border p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-brand-green text-2xl font-bold tracking-tight md:text-3xl">
            {condominio}
          </h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Referência:{" "}
          <span className="text-foreground font-medium">{formatDatePt(referencia)}</span>
        </p>
      </div>

      {variant === "gerencial" ? (
        <span className="border-brand-border bg-muted text-muted-foreground mt-2 inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide uppercase">
          <LayoutDashboard className="size-3.5" />
          {titulo}
        </span>
      ) : (
        <p className="text-brand-maroon mt-1 text-base font-medium">{titulo}</p>
      )}

      <p className="text-muted-foreground mt-2 text-xs">
        {semanaInicio ? (
          <>
            Período:{" "}
            <span className="text-foreground font-medium">
              {formatDatePt(semanaInicio)} até{" "}
              {semanaFim ? formatDatePt(semanaFim) : formatDatePt(addDays(semanaInicio, 6))}
            </span>
          </>
        ) : (
          <>
            Período:{" "}
            <span className="text-foreground font-medium">Todas as semanas disponíveis</span>
          </>
        )}
        {congelado && " · Estes dados são fixos e não refletem mudanças feitas depois no Notion."}
      </p>

      <div className="border-brand-border mt-4 border-t pt-4">
        <p className="text-foreground text-sm leading-relaxed">{descricao}</p>
      </div>
    </header>
  );
}
