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
  const diff = day === 0 ? -6 : 1 - day;
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
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
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
    timeZone: "UTC",
  });
}

export type Filters = {
  condominio: string;
  responsavel: string;
  status: string;
};

export function applyFilters(rows: Demanda[], f: Filters): Demanda[] {
  return rows.filter((r) => {
    if (f.condominio && !normalizeForMatch(r.condominio).includes(normalizeForMatch(f.condominio)))
      return false;
    if (f.responsavel && r.responsavel !== f.responsavel) return false;
    if (f.status && r.status !== f.status) return false;
    return true;
  });
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// Semanas fixas do negócio (não são semanas ISO): Semana 1 começa neste sábado,
// blocos de 7 dias.
export const WEEK_ANCHOR = "2025-12-27";
export const SEMANA_TODAS = "todas";

export function weekRange(n: number): { start: string; end: string } {
  const start = addDays(WEEK_ANCHOR, (n - 1) * 7);
  return { start, end: addDays(start, 6) };
}

export function currentWeekNumber(): number {
  const today = new Date().toISOString().slice(0, 10);
  const diffDays = Math.floor(
    (new Date(today).getTime() - new Date(WEEK_ANCHOR).getTime()) / 86_400_000,
  );
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

// Lista pra popular o dropdown de semanas: da semana 1 até a próxima semana
// (permite montar o link da newsletter de sexta-feira com antecedência).
export function listWeekOptions(): Array<{ n: number; start: string; end: string }> {
  const upTo = currentWeekNumber() + 1;
  return Array.from({ length: upTo }, (_, i) => ({ n: i + 1, ...weekRange(i + 1) }));
}

export function brToIso(br: string): string {
  const [d, m, y] = br.split("-");
  return `${y}-${m}-${d}`;
}

export function isoToBrDash(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export function normalizeForMatch(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}
