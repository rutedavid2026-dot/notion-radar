import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { Demanda } from "@/lib/notion.functions";
import { formatDatePt, formatDateTimePt } from "@/lib/report-utils";
import { StatusBadge } from "./StatusBadge";

type SortKey = "demanda" | "responsavel" | "criadaEm" | "status" | "ultimaAtualizacao";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;

export function DemandasTable({ rows }: { rows: Demanda[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("ultimaAtualizacao");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = (a[sortKey] ?? "") as string;
      const bv = (b[sortKey] ?? "") as string;
      const cmp = av.localeCompare(bv, "pt-BR");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
    setPage(0);
  };

  return (
    <div className="bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="border-b p-5">
        <h3 className="text-foreground text-sm font-semibold">Detalhamento operacional</h3>
        <p className="text-muted-foreground text-xs">
          {sorted.length} demanda{sorted.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Demanda" k="demanda" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortableHead label="Responsável" k="responsavel" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortableHead label="Criada em" k="criadaEm" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortableHead label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortableHead label="Última atualização" k="ultimaAtualizacao" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <TableHead>Observações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-10 text-center text-sm">
                  Nenhuma demanda encontrada para os filtros atuais.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-[280px] font-medium">
                    <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {r.demanda}
                    </a>
                  </TableCell>
                  <TableCell>{r.responsavel}</TableCell>
                  <TableCell>{formatDatePt(r.criadaEm)}</TableCell>
                  <TableCell>
                    <StatusBadge value={r.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDateTimePt(r.ultimaAtualizacao)}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[300px] text-xs">
                    <div className="line-clamp-2">
                      {r.historico || r.ultimaAcao || "—"}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t p-4">
          <span className="text-muted-foreground text-xs">
            Página {currentPage + 1} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SortableHead({
  label,
  k,
  sortKey,
  sortDir,
  onClick,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onClick(k)}
        className="hover:text-foreground inline-flex items-center gap-1"
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </TableHead>
  );
}
