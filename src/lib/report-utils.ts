import type { Demanda } from "./notion.functions";

export const STATUS_CONCLUIDO = ["Concluído", "Feito"];
export const STATUS_CANCELADO = ["Cancelado"];
export const STATUS_ANDAMENTO = [
  "Em andamento",
  "Agendado",
  "Orçamento",
  "Orçando",
  "Reaberto",
  "Sempre",
];
export const STATUS_PENDENTE = [
  "Não iniciado",
  "Aguardando",
  "Assembleia",
  "Planejando",
  "Atrasado",
  "Parada",
];

export type StatusBucket = "concluido" | "cancelado" | "andamento" | "pendente";

// Comparação sem distinguir maiúsculas/acentos: o mesmo status aparece com
// grafias diferentes entre condomínios (ex.: Vivendas Home Club usa
// "cancelado", "orcamento" sem cedilha, "orçando", "sempre" em minúsculas,
// enquanto outras bases usam a forma capitalizada/acentuada).
function statusIn(lista: string[], valor: string): boolean {
  const alvo = normalizeForMatch(valor);
  return lista.some((item) => normalizeForMatch(item) === alvo);
}

export function statusBucket(s: string): StatusBucket {
  if (statusIn(STATUS_CONCLUIDO, s)) return "concluido";
  if (statusIn(STATUS_CANCELADO, s)) return "cancelado";
  if (statusIn(STATUS_ANDAMENTO, s)) return "andamento";
  return "pendente";
}

// Tarefas fechadas (concluídas ou canceladas) saem das listas de acompanhamento
// operacional — não precisam mais de ação, independente do vocabulário de status
// do condomínio de origem.
export function isFechada(s: string): boolean {
  const b = statusBucket(s);
  return b === "concluido" || b === "cancelado";
}

// "Prioridade" e "Responsável" podem vir como multi-seleção do Notion (ex.:
// "Alta, Grande Investimento" ou "Carina, Roberto") — normaliza pra lista
// antes de checar pertencimento.
export function splitLista(s: string): string[] {
  return s
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function prioridadeList(p: string): string[] {
  return splitLista(p);
}

export function temPrioridade(p: string, alvo: string): boolean {
  return prioridadeList(p).includes(alvo);
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
  responsavel: string[];
  status: string;
};

export function applyFilters(rows: Demanda[], f: Filters): Demanda[] {
  return rows.filter((r) => {
    if (f.responsavel.length > 0) {
      const responsaveisDaLinha = splitLista(r.responsavel);
      if (!f.responsavel.some((sel) => responsaveisDaLinha.includes(sel))) return false;
    }
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

// Slug amigável de um nome de condomínio (ex.: "Vivendas Home Club" →
// "vivendas-home-club") — mesmo algoritmo usado pelo Apps Script
// (nomeAbaAmigavel em apps-script/GerenciarCondominios.gs) pra nomear a aba
// de histórico. Usado aqui pra resolver a URL /vivendas-home-club de volta
// pro nome de exibição do condomínio.
export function slugify(nome: string): string {
  return (
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "") || ""
  );
}
