import type { Demanda } from "./notion.functions";

export const STATUS_CONCLUIDO = ["Concluído"];
export const STATUS_ANDAMENTO = ["Em andamento", "Agendado", "Orçamento"];
export const STATUS_PENDENTE = ["Não iniciado", "Aguardando"];

export function statusBucket(s: string): "concluido" | "andamento" | "pendente" {
  if (STATUS_CONCLUIDO.includes(s)) return "concluido";
  if (STATUS_ANDAMENTO.includes(s)) return "andamento";
  return "pendente";
}

// Returns ISO date (YYYY-MM-DD) of the Monday of the given date's week.
export function mondayOf(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const day = d.getUTCDay(); // 0 sun - 6 sat
  const diff = (day === 0 ? -6 : 1 - day);
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDatePt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTimePt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type Filters = {
  condominio: string;
  semana: string; // Monday ISO, "" = all
  responsavel: string;
  status: string;
};

export function applyFilters(rows: Demanda[], f: Filters): Demanda[] {
  return rows.filter((r) => {
    if (f.condominio && r.condominio !== f.condominio) return false;
    if (f.responsavel && r.responsavel !== f.responsavel) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.semana) {
      if (!r.criadaEm) return false;
      const m = mondayOf(r.criadaEm);
      if (m !== f.semana) return false;
    }
    return true;
  });
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}
