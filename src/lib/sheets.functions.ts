import { createServerFn } from "@tanstack/react-start";
import type { Demanda } from "./notion.functions";

const SPREADSHEET_ID = "1fEkPgTf6oGYknWEP6zzi8eyBTpoDDQR0goJg1D_Wed0";
const HISTORICO_GID = "1546449563";

export type HistoricoResult = {
  data: Demanda[];
  semanaN: number | null;
  capturadoEm: string | null;
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

export const getHistoricoSemana = createServerFn({ method: "GET" })
  .validator((input: unknown) => input as { semanaInicio: string })
  .handler(async ({ data }): Promise<HistoricoResult> => {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${HISTORICO_GID}`;

    // Falhas de rede/HTTP lançam erro de verdade (em vez de um resultado "vazio")
    // para que o React Query aplique seu retry automático — não queremos que uma
    // falha transitória fique em cache como "nenhuma fotografia para esta semana".
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Falha ao ler planilha: HTTP ${res.status}`);
    }
    const text = await res.text();

    const [header, ...body] = parseCsv(text);
    if (!header) {
      return { data: [], semanaN: null, capturadoEm: null };
    }
    const col = (name: string) => header.indexOf(name);

    const rows = body
      .filter((r) => r.length > 1)
      .map((r) => ({
        semanaInicio: r[col("SemanaInicio")] ?? "",
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
      }))
      .filter((r) => r.semanaInicio === data.semanaInicio);

    if (rows.length === 0) {
      return { data: [], semanaN: null, capturadoEm: null };
    }

    const cleaned: Demanda[] = rows.map(
      ({ semanaInicio: _semanaInicio, semanaN: _semanaN, capturadoEm: _capturadoEm, ...d }) => d,
    );

    return {
      data: cleaned,
      semanaN: rows[0].semanaN,
      capturadoEm: rows[0].capturadoEm,
    };
  });
