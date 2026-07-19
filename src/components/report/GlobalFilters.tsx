import { useNavigate } from "@tanstack/react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  formatDatePt,
  brToIso,
  isoToBrDash,
  listWeekOptions,
  currentWeekNumber,
  SEMANA_TODAS,
} from "@/lib/report-utils";

type SearchState = {
  condominio: string;
  semanainicio: string;
  semanafim: string;
  responsavel: string;
  status: string;
};

type Props = {
  search: SearchState;
  condominios: string[];
  responsaveis: string[];
  statuses: string[];
};

export function GlobalFilters({ search, condominios, responsaveis, statuses }: Props) {
  const navigate = useNavigate({ from: "/" });

  const update = (patch: Partial<SearchState>) => {
    navigate({
      search: (prev: SearchState) => ({ ...prev, ...patch }),
    });
  };

  const clear = () =>
    navigate({
      search: () => ({
        condominio: "",
        semanainicio: "",
        semanafim: "",
        responsavel: "",
        status: "",
      }),
    });

  const ALL = "__all__";

  const weekOptions = listWeekOptions();
  const currentWeek = currentWeekNumber();
  const isTodas = search.semanainicio === SEMANA_TODAS;
  const selectedWeekN = isTodas
    ? undefined
    : (weekOptions.find(
        (w) => w.start === (search.semanainicio ? brToIso(search.semanainicio) : ""),
      )?.n ?? currentWeek);

  return (
    <div className="bg-card rounded-xl border p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <FilterBlock label="Condomínio">
          <Select
            value={search.condominio || ALL}
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
            value={isTodas ? ALL : String(selectedWeekN)}
            onValueChange={(v) => {
              if (v === ALL) {
                update({ semanainicio: SEMANA_TODAS, semanafim: SEMANA_TODAS });
                return;
              }
              const w = weekOptions.find((o) => o.n === Number(v));
              if (!w) return;
              update({ semanainicio: isoToBrDash(w.start), semanafim: isoToBrDash(w.end) });
            }}
          >
            <SelectTrigger className="w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as semanas</SelectItem>
              {weekOptions.map((w) => (
                <SelectItem key={w.n} value={String(w.n)}>
                  Semana {w.n} — {formatDatePt(w.start)} a {formatDatePt(w.end)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterBlock>

        <FilterBlock label="Responsável">
          <Select
            value={search.responsavel || ALL}
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
            value={search.status || ALL}
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
