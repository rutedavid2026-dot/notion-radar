import { createServerFn } from "@tanstack/react-start";
import type { Demanda } from "./notion.functions";

const SPREADSHEET_ID = "1fEkPgTf6oGYknWEP6zzi8eyBTpoDDQR0goJg1D_Wed0";
// Aba de histórico usada enquanto a planilha índice não tem nenhum condomínio
// cadastrado (compatibilidade com o deploy single-tenant original).
const HISTORICO_GID_LEGADO = "1546449563";

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

export type CondominioRegistroEntry = {
  condominio: string;
  notionDatabaseId: string;
  historicoGid: string;
  id: string;
};

export type GetCondominiosRegistryResult = {
  data: CondominioRegistroEntry[];
  error: string | null;
};

export type FollowUpEntry = {
  condominio: string;
  semana: number;
  linkFollowUp: string;
  dataInicio: string;
  dataTermino: string;
};

export type GetFollowUpsResult = {
  data: FollowUpEntry[];
  error: string | null;
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

async function fetchCsv(spreadsheetId: string, gid: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao ler planilha: HTTP ${res.status}`);
  }
  return parseCsv(await res.text());
}

// Extrai o ID de database do Notion (32 hex chars, com ou sem hífens) de uma
// URL colada na planilha índice.
export function extractNotionDatabaseId(url: string): string | null {
  const match = url.match(
    /[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}/,
  );
  if (!match) return null;
  return match[0].replace(/-/g, "");
}

function col(header: string[], ...names: string[]): number {
  for (const name of names) {
    const i = header.indexOf(name);
    if (i !== -1) return i;
  }
  return -1;
}

// Mesmo algoritmo de report-utils.ts, duplicado de propósito — mantém este
// arquivo livre de dependência de módulos "de UI" e evita qualquer risco de
// import circular (report-utils.ts importa o tipo `Demanda` daqui).
function slugify(nome: string): string {
  return (
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "") || ""
  );
}

// Lê a planilha índice "base-gestao-em-movimento" (Condomínio | URL da
// database Notion | GID da aba de histórico daquele condomínio). Linhas sem
// condomínio, URL válida ou database Notion reconhecível são ignoradas em vez
// de derrubar o carregamento inteiro.
export const getCondominiosRegistry = createServerFn({ method: "GET" }).handler(
  async (): Promise<GetCondominiosRegistryResult> => {
    // Mesma planilha do histórico (SPREADSHEET_ID acima) — a env var permite
    // apontar pra outra planilha em algum deploy futuro, mas não é segredo
    // (é lida via export CSV público), por isso tem valor padrão fixo aqui
    // em vez de exigir configuração em todo ambiente nesse.
    const spreadsheetId = process.env.REGISTRY_SPREADSHEET_ID ?? SPREADSHEET_ID;
    const gid = process.env.REGISTRY_GID ?? "0";

    try {
      const [header, ...body] = await fetchCsv(spreadsheetId, gid);
      if (!header) return { data: [], error: null };

      const iCondominio = col(header, "Condomínio", "Condominio");
      const iUrl = col(header, "URL");
      const iGid = col(header, "GID Histórico", "GID Historico", "Aba");
      const iId = col(header, "id", "Id", "ID");

      const data: CondominioRegistroEntry[] = [];
      for (const r of body) {
        const condominio = (r[iCondominio] ?? "").trim();
        const url = (r[iUrl] ?? "").trim();
        const historicoGid = (r[iGid] ?? "").trim();
        if (!condominio || !url) continue;
        const notionDatabaseId = extractNotionDatabaseId(url);
        if (!notionDatabaseId) continue;
        // Fallback pro slug calculado em linhas antigas ainda sem a coluna
        // "id" preenchida (ex.: cadastradas antes dessa coluna existir).
        const id = (r[iId] ?? "").trim() || slugify(condominio);
        data.push({ condominio, notionDatabaseId, historicoGid, id });
      }
      return { data, error: null };
    } catch (e) {
      return {
        data: [],
        error: e instanceof Error ? e.message : "Erro desconhecido ao ler a planilha índice",
      };
    }
  },
);

// Lê a aba "Publicação"/follow-ups da mesma planilha índice (Condomínio |
// Semana | Link do follow-up | Data início | Data término) — uma linha por
// condomínio por semana, usada pela página /gerenciar pra listar os links
// públicos do relatório sem a cliente precisar abrir a planilha.
export const getFollowUps = createServerFn({ method: "GET" }).handler(
  async (): Promise<GetFollowUpsResult> => {
    const spreadsheetId = process.env.REGISTRY_SPREADSHEET_ID ?? SPREADSHEET_ID;
    const gid = process.env.FOLLOWUPS_GID ?? "1720412368";

    try {
      const [header, ...body] = await fetchCsv(spreadsheetId, gid);
      if (!header) return { data: [], error: null };

      const iCondominio = col(header, "condominio", "condomínio", "Condominio", "Condomínio");
      const iSemana = col(header, "semana", "Semana");
      const iLink = col(header, "link-follow-up", "link_followup", "Link Follow-up", "URL");
      const iInicio = col(header, "data-inicio", "data_inicio", "Data Início", "data-início");
      const iTermino = col(header, "data-termino", "data_termino", "Data Término", "data-término");

      const data: FollowUpEntry[] = [];
      for (const r of body) {
        const condominio = (r[iCondominio] ?? "").trim();
        const linkFollowUp = (r[iLink] ?? "").trim();
        const semana = Number((r[iSemana] ?? "").trim());
        if (!condominio || !linkFollowUp || !Number.isFinite(semana)) continue;
        data.push({
          condominio,
          semana,
          linkFollowUp,
          dataInicio: (r[iInicio] ?? "").trim(),
          dataTermino: (r[iTermino] ?? "").trim(),
        });
      }
      data.sort((a, b) => a.condominio.localeCompare(b.condominio) || b.semana - a.semana);
      return { data, error: null };
    } catch (e) {
      return {
        data: [],
        error: e instanceof Error ? e.message : "Erro desconhecido ao ler a planilha de follow-ups",
      };
    }
  },
);

type RawRow = Demanda & {
  semanaInicio: string;
  semanaFim: string;
  semanaN: number;
  capturadoEm: string;
};

// Falhas de rede/HTTP lançam erro de verdade (em vez de um resultado "vazio")
// para que o React Query aplique seu retry automático — não queremos que uma
// falha transitória fique em cache como "nenhuma fotografia para esta semana".
async function fetchHistoricoRows(gid: string): Promise<RawRow[]> {
  const [header, ...body] = await fetchCsv(SPREADSHEET_ID, gid);
  if (!header) return [];
  const c = (name: string) => header.indexOf(name);

  return body
    .filter((r) => r.length > 1)
    .map((r) => ({
      semanaInicio: r[c("SemanaInicio")] ?? "",
      semanaFim: r[c("SemanaFim")] ?? "",
      semanaN: Number(r[c("SemanaN")]),
      capturadoEm: r[c("CapturadoEm")] ?? "",
      id: r[c("PageId")] ?? "",
      // Nomes novos (Tarefa/Setor) com fallback pros nomes antigos
      // (Demanda/Area), pra continuar lendo abas que ainda não tiveram o
      // cabeçalho reescrito (renomearCabecalhosExistentes em Config.gs).
      demanda: r[c("Tarefa")] || r[c("Demanda")] || "",
      responsavel: r[c("Responsavel")] ?? "",
      status: r[c("Status")] ?? "",
      prioridade: r[c("Prioridade")] ?? "",
      condominio: r[c("Condominio")] ?? "",
      area: r[c("Setor")] || r[c("Area")] || "",
      criadaEm: r[c("CriadaEm")] || null,
      ultimaAtualizacao: r[c("UltimaAtualizacao")] ?? "",
      historico: r[c("Historico")] ?? "",
      dataUltimaEdicao: r[c("DataUltimaEdicao")] ?? "",
      url: r[c("URL")] ?? "",
      ordem: r[c("Ordem")] ? Number(r[c("Ordem")]) : null,
      // Nomes novos (PrevisaoEmDias/DataPrevisaoConclusao/DataConclusao) com
      // fallback pros nomes antigos, pra continuar lendo abas que ainda não
      // tiveram o cabeçalho reescrito (renomearCabecalhosExistentes em
      // Config.gs).
      previsao: r[c("PrevisaoEmDias")] || r[c("Previsao")] || null,
      dataPrevista: r[c("DataPrevisaoConclusao")] || r[c("DataPrevista")] || null,
      concluidoEm: r[c("DataConclusao")] || r[c("ConcluidoEm")] || null,
      situacaoPrazo: r[c("SituacaoPrazo")] || null,
    }));
}

type HistoricoSource = { condominio: string | null; id: string | null; gid: string };

// Cada condomínio tem sua própria aba na planilha de histórico (mesmo
// spreadsheet, GID por linha da planilha índice). Sem registro cadastrado,
// cai pra aba legada única (compatibilidade com o deploy original).
// `condominioSlug` restringe a busca a um único condomínio (página por
// condomínio); `condominioSlugs` restringe a um subconjunto (página
// consolidada com filtro de condomínios) — sem nenhum dos dois, agrega todas
// as abas cadastradas.
async function resolveHistoricoSources(
  condominioSlug?: string,
  condominioSlugs?: string[],
): Promise<HistoricoSource[]> {
  const registry = await getCondominiosRegistry();
  const comAba = registry.data.filter((r) => r.historicoGid);
  const fontes: HistoricoSource[] =
    comAba.length > 0
      ? comAba.map((r) => ({ condominio: r.condominio, id: r.id, gid: r.historicoGid }))
      : [{ condominio: null, id: null, gid: HISTORICO_GID_LEGADO }];

  const slugs = condominioSlugs && condominioSlugs.length > 0 ? condominioSlugs : condominioSlug ? [condominioSlug] : null;
  if (!slugs) return fontes;
  // `condominio === null` é o fallback legado (single-tenant) — mantido mesmo
  // com slug(s) pedido(s), já que nesse caso não há como confirmar de
  // antemão qual condomínio é sem ler as linhas da aba.
  return fontes.filter((f) => f.condominio === null || (f.id && slugs.includes(f.id)));
}

async function fetchAllHistoricoRows(
  condominioSlug?: string,
  condominioSlugs?: string[],
): Promise<RawRow[]> {
  const sources = await resolveHistoricoSources(condominioSlug, condominioSlugs);
  const settled = await Promise.allSettled(sources.map((s) => fetchHistoricoRows(s.gid)));

  const failures = settled.filter((s) => s.status === "rejected");
  if (failures.length === settled.length) {
    throw (failures[0] as PromiseRejectedResult).reason;
  }

  const all: RawRow[] = [];
  settled.forEach((res, i) => {
    if (res.status !== "fulfilled") return;
    const condominio = sources[i].condominio;
    for (const row of res.value) {
      all.push(condominio ? { ...row, condominio } : row);
    }
  });
  return all;
}

export const getHistoricoSemana = createServerFn({ method: "GET" })
  .validator(
    (input: unknown) =>
      input as { semanaInicio: string; condominioSlug?: string; condominioSlugs?: string[] },
  )
  .handler(async ({ data }): Promise<HistoricoResult> => {
    const all = await fetchAllHistoricoRows(data.condominioSlug, data.condominioSlugs);
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
export const getSemanasDisponiveis = createServerFn({ method: "GET" })
  .validator(
    (input: unknown) => (input ?? {}) as { condominioSlug?: string; condominioSlugs?: string[] },
  )
  .handler(async ({ data }): Promise<SemanaDisponivel[]> => {
    const all = await fetchAllHistoricoRows(data.condominioSlug, data.condominioSlugs);
    const map = new Map<number, SemanaDisponivel>();
    for (const r of all) {
      if (!r.semanaN || map.has(r.semanaN)) continue;
      map.set(r.semanaN, { n: r.semanaN, start: r.semanaInicio, end: r.semanaFim });
    }
    return Array.from(map.values()).sort((a, b) => a.n - b.n);
  });
