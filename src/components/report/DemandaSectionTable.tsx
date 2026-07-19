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
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-brand-green text-center font-semibold text-white">
                Demanda / responsável
              </TableHead>
              <TableHead className="bg-brand-green text-center font-semibold text-white">
                Criada em
              </TableHead>
              <TableHead className="bg-brand-green text-center font-semibold text-white">
                Status
              </TableHead>
              <TableHead className="bg-brand-green text-center font-semibold text-white">
                Última ação
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground py-10 text-center text-sm">
                  Nenhuma demanda encontrada para os filtros atuais.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r, i) => (
                <TableRow key={r.id} className={i % 2 === 1 ? "bg-brand-cream/40" : undefined}>
                  <TableCell className="max-w-[280px] align-top">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:underline"
                    >
                      {r.demanda}
                    </a>
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      Resp.: {r.responsavel}
                    </div>
                  </TableCell>
                  <TableCell className="text-center align-top whitespace-nowrap">
                    {formatDatePt(r.criadaEm)}
                  </TableCell>
                  <TableCell className="text-center align-top whitespace-nowrap">
                    {r.status}
                  </TableCell>
                  <TableCell className="text-muted-foreground align-top text-sm">
                    {r.historico || r.ultimaAcao || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
