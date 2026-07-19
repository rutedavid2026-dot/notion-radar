import { createServerFn } from "@tanstack/react-start";
import type { Demanda } from "./notion.functions";

const SPREADSHEET_ID = "1fEkPgTf6oGYknWEP6zzi8eyBTpoDDQR0goJg1D_Wed0";
const HISTORICO_GID = "1546449563";

export type HistoricoResult = {
  data: Demanda[];
  semanaN: number | null;
  capturadoEm: string | null;
};

export type SemanaDisponivel = {
  n: number;
  start: string;
  end: string;
};

// Parser CSV mínimo (RFC4180): trata campos entre aspas com vírgula, quebra de
// linha e aspas escapadas ("").
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignora, o \n seguinte fecha a linha
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

type RawRow = Demanda & {
  semanaInicio: string;
  semanaFim: string;
  semanaN: number;
  capturadoEm: string;
};

// Falhas de rede/HTTP lançam erro de verdade (em vez de um resultado "vazio")
// para que o React Query aplique seu retry automático — não queremos que uma
// falha transitória fique em cache como "nenhuma fotografia para esta semana".
async function fetchHistoricoRows(): Promise<RawRow[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${HISTORICO_GID}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao ler planilha: HTTP ${res.status}`);
  }
  const text = await res.text();

  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const col = (name: string) => header.indexOf(name);

  return body
    .filter((r) => r.length > 1)
    .map((r) => ({
      semanaInicio: r[col("SemanaInicio")] ?? "",
      semanaFim: r[col("SemanaFim")] ?? "",
      semanaN: Number(r[col("SemanaN")]),
      capturadoEm: r[col("CapturadoEm")] ?? "",
      id: r[col("PageId")] ?? "",
      demanda: r[col("Demanda")] ?? "",
      responsavel: r[col("Responsavel")] ?? "",
      status: r[col("Status")] ?? "",
      prioridade: r[col("Prioridade")] ?? "",
      condominio: r[col("Condominio")] ?? "",
      area: r[col("Area")] ?? "",
      criadaEm: r[col("CriadaEm")] || null,
      ultimaAcao: r[col("UltimaAcao")] ?? "",
      historico: r[col("Historico")] ?? "",
      ultimaAtualizacao: r[col("UltimaAtualizacao")] ?? "",
      url: r[col("URL")] ?? "",
    }));
}

export const getHistoricoSemana = createServerFn({ method: "GET" })
  .validator((input: unknown) => input as { semanaInicio: string })
  .handler(async ({ data }): Promise<HistoricoResult> => {
    const all = await fetchHistoricoRows();
    const rows = all.filter((r) => r.semanaInicio === data.semanaInicio);

    if (rows.length === 0) {
      return { data: [], semanaN: null, capturadoEm: null };
    }

    const cleaned: Demanda[] = rows.map(
      ({
        semanaInicio: _semanaInicio,
        semanaFim: _semanaFim,
        semanaN: _semanaN,
        capturadoEm: _capturadoEm,
        ...d
      }) => d,
    );

    return {
      data: cleaned,
      semanaN: rows[0].semanaN,
      capturadoEm: rows[0].capturadoEm,
    };
  });

// Lista as semanas que realmente têm fotografia salva na planilha — usada
// pelo dropdown de filtro, pra não oferecer semanas "fantasma" (calculadas
// pela fórmula de âncora, mas nunca capturadas pelo Apps Script).
export const getSemanasDisponiveis = createServerFn({ method: "GET" }).handler(
  async (): Promise<SemanaDisponivel[]> => {
    const all = await fetchHistoricoRows();
    const map = new Map<number, SemanaDisponivel>();
    for (const r of all) {
      if (!r.semanaN || map.has(r.semanaN)) continue;
      map.set(r.semanaN, { n: r.semanaN, start: r.semanaInicio, end: r.semanaFim });
    }
    return Array.from(map.values()).sort((a, b) => a.n - b.n);
  },
);
