import { User } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Demanda } from "@/lib/notion.functions";
import { formatDatePt } from "@/lib/report-utils";

type Props = {
  title: string;
  description: string;
  rows: Demanda[];
};

export function DemandaSectionTable({ title, description, rows }: Props) {
  return (
    <div className="bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="border-b p-5">
        <h3 className="text-brand-green text-lg font-bold tracking-tight">{title}</h3>
        <p className="text-muted-foreground mt-1 text-xs">{description}</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          Nenhuma demanda encontrada para os filtros atuais.
        </p>
      ) : (
        <>
          <ul className="sm:hidden">
            {rows.map((r, i) => (
              <li
                key={r.id}
                className={i % 2 === 1 ? "bg-brand-cream/40" : "bg-card"}
                style={{ borderBottom: "0.5px solid var(--brand-border)" }}
              >
                <div className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:underline"
                    >
                      {r.demanda}
                    </a>
                    <div className="text-muted-foreground mt-1 flex items-center gap-1 text-sm">
                      <User className="size-3.5 shrink-0" />
                      <span className="truncate">{r.responsavel}</span>
                    </div>
                    <div className="text-muted-foreground/80 mt-1 text-xs">
                      {formatDatePt(r.criadaEm)}
                      {(r.historico || r.ultimaAtualizacao) && (
                        <span> · {r.historico || r.ultimaAtualizacao}</span>
                      )}
                    </div>
                  </div>
                  <span className="border-brand-border bg-brand-cream text-brand-green shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">
                    {r.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto sm:block">
            <Table className="table-fixed">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[18%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[26%]" />
              </colgroup>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="bg-brand-green text-center font-semibold text-white">
                    Demanda
                  </TableHead>
                  <TableHead className="bg-brand-green text-center font-semibold text-white">
                    Responsável
                  </TableHead>
                  <TableHead className="bg-brand-green text-center font-semibold text-white">
                    Criada em
                  </TableHead>
                  <TableHead className="bg-brand-green text-center font-semibold text-white">
                    Status
                  </TableHead>
                  <TableHead className="bg-brand-green text-center font-semibold text-white">
                    Última Atualização
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.id} className={i % 2 === 1 ? "bg-brand-cream/40" : undefined}>
                    <TableCell className="align-top">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium hover:underline"
                      >
                        {r.demanda}
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-center align-top text-sm">
                      {r.responsavel}
                    </TableCell>
                    <TableCell className="text-center align-top whitespace-nowrap">
                      {formatDatePt(r.criadaEm)}
                    </TableCell>
                    <TableCell className="text-center align-top whitespace-nowrap">
                      {r.status}
                    </TableCell>
                    <TableCell className="text-muted-foreground align-top text-sm">
                      {r.historico || r.ultimaAtualizacao || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
