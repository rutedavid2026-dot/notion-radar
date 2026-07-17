import { useNavigate } from "@tanstack/react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatDatePt, addDays, type Filters } from "@/lib/report-utils";

type Props = {
  filters: Filters;
  condominios: string[];
  responsaveis: string[];
  statuses: string[];
  semanas: string[]; // Monday ISO list, desc
};

export function GlobalFilters({
  filters,
  condominios,
  responsaveis,
  statuses,
  semanas,
}: Props) {
  const navigate = useNavigate({ from: "/" });

  const update = (patch: Partial<Filters>) => {
    navigate({
      search: (prev: Filters) => ({ ...prev, ...patch }),
    });
  };

  const clear = () =>
    navigate({
      search: () => ({ condominio: "", semana: "", responsavel: "", status: "" }),
    });

  const ALL = "__all__";

  return (
    <div className="bg-card rounded-xl border p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <FilterBlock label="Condomínio">
          <Select
            value={filters.condominio || ALL}
            onValueChange={(v) => update({ condominio: v === ALL ? "" : v })}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {condominios.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterBlock>

        <FilterBlock label="Semana">
          <Select
            value={filters.semana || ALL}
            onValueChange={(v) => update({ semana: v === ALL ? "" : v })}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as semanas</SelectItem>
              {semanas.map((s) => (
                <SelectItem key={s} value={s}>
                  {formatDatePt(s)} – {formatDatePt(addDays(s, 6))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterBlock>

        <FilterBlock label="Responsável">
          <Select
            value={filters.responsavel || ALL}
            onValueChange={(v) => update({ responsavel: v === ALL ? "" : v })}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {responsaveis.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterBlock>

        <FilterBlock label="Status">
          <Select
            value={filters.status || ALL}
            onValueChange={(v) => update({ status: v === ALL ? "" : v })}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterBlock>

        <Button variant="outline" onClick={clear} className="ml-auto">
          Limpar filtros
        </Button>
      </div>
    </div>
  );
}

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </span>
      {children}
    </div>
  );
}
