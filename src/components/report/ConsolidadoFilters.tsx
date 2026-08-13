import { useNavigate } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  formatDatePt,
  brToIso,
  isoToBrDash,
  currentWeekNumber,
  splitLista,
  SEMANA_TODAS,
} from "@/lib/report-utils";

type SearchState = {
  semanainicio: string;
  semanafim: string;
  condominios: string;
  responsavel: string;
  status: string;
  situacaoPrazo: string;
};

type WeekOption = { n: number; start: string; end: string };
type CondominioOption = { id: string; condominio: string };

type Props = {
  search: SearchState;
  weekOptions: WeekOption[];
  condominioOptions: CondominioOption[];
  responsaveis: string[];
  statuses: string[];
  situacoesPrazo: string[];
};

export function ConsolidadoFilters({
  search,
  weekOptions,
  condominioOptions,
  responsaveis,
  statuses,
  situacoesPrazo,
}: Props) {
  const navigate = useNavigate({ from: "/relatorio-geral" });

  // resetScroll: false — trocar um filtro só atualiza os dados da página, não
  // deve jogar o usuário de volta pro topo.
  const update = (patch: Partial<SearchState>) => {
    navigate({
      search: (prev: SearchState) => ({ ...prev, ...patch }),
      resetScroll: false,
    });
  };

  const clear = () =>
    navigate({
      search: () => ({
        semanainicio: "",
        semanafim: "",
        condominios: "",
        responsavel: "",
        status: "",
        situacaoPrazo: "",
      }),
      resetScroll: false,
    });

  const ALL = "__all__";

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
        <FilterBlock label="Condomínios">
          <CondominiosFilter
            value={search.condominios}
            options={condominioOptions}
            onChange={(v) => update({ condominios: v })}
          />
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
          <ResponsavelFilter
            value={search.responsavel}
            options={responsaveis}
            onChange={(v) => update({ responsavel: v })}
          />
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

        <FilterBlock label="Situação de Prazo">
          <Select
            value={search.situacaoPrazo || ALL}
            onValueChange={(v) => update({ situacaoPrazo: v === ALL ? "" : v })}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {situacoesPrazo.map((s) => (
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

type CondominiosFilterProps = {
  value: string;
  options: CondominioOption[];
  onChange: (value: string) => void;
};

// Seleção guardada na URL como string de ids separados por vírgula. Vazio =
// "Todos os condomínios" (nenhum filtro aplicado, agrega tudo que estiver
// cadastrado na planilha índice) — igual à convenção do filtro de
// Responsável.
function CondominiosFilter({ value, options, onChange }: CondominiosFilterProps) {
  const selecionados = splitLista(value);

  const toggle = (id: string, marcado: boolean) => {
    const proximos = marcado ? [...selecionados, id] : selecionados.filter((s) => s !== id);
    onChange(proximos.join(","));
  };

  const nomeById = (id: string) => options.find((o) => o.id === id)?.condominio ?? id;

  const label =
    selecionados.length === 0
      ? "Todos"
      : selecionados.length === 1
        ? nomeById(selecionados[0])
        : `${selecionados.length} selecionados`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-[200px] justify-between font-normal"
          title={selecionados.map(nomeById).join(", ")}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[300px] w-[240px] overflow-y-auto">
        <DropdownMenuItem
          className="gap-2"
          onSelect={(e) => e.preventDefault()}
          onClick={() => onChange("")}
        >
          <Checkbox checked={selecionados.length === 0} className="pointer-events-none" />
          Todos
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuItem
            key={o.id}
            className="gap-2"
            onSelect={(e) => e.preventDefault()}
            onClick={() => toggle(o.id, !selecionados.includes(o.id))}
          >
            <Checkbox checked={selecionados.includes(o.id)} className="pointer-events-none" />
            {o.condominio}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ResponsavelFilterProps = {
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

function ResponsavelFilter({ value, options, onChange }: ResponsavelFilterProps) {
  const selecionados = splitLista(value);

  const toggle = (nome: string, marcado: boolean) => {
    const proximos = marcado ? [...selecionados, nome] : selecionados.filter((s) => s !== nome);
    onChange(proximos.join(","));
  };

  const label =
    selecionados.length === 0
      ? "Todos"
      : selecionados.length === 1
        ? selecionados[0]
        : `${selecionados.length} selecionados`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-[200px] justify-between font-normal"
          title={selecionados.join(", ")}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[300px] w-[220px] overflow-y-auto">
        <DropdownMenuItem
          className="gap-2"
          onSelect={(e) => e.preventDefault()}
          onClick={() => onChange("")}
        >
          <Checkbox checked={selecionados.length === 0} className="pointer-events-none" />
          Todos
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((nome) => (
          <DropdownMenuItem
            key={nome}
            className="gap-2"
            onSelect={(e) => e.preventDefault()}
            onClick={() => toggle(nome, !selecionados.includes(nome))}
          >
            <Checkbox checked={selecionados.includes(nome)} className="pointer-events-none" />
            {nome}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
