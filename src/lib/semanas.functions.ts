import { createServerFn } from "@tanstack/react-start";
import { fetchDemandas, type Demanda } from "@/lib/mcp/notion";
import { addDays, mondayOf, statusBucket } from "@/lib/report-utils";

export type SemanaResumo = {
  id: string;
  label: string;
  dataInicio: string;
  dataFim: string;
  criadaEm: string;
  total: number;
  concluidas: number;
  andamento: number;
  pendentes: number;
  urgentes: number;
};

export type CreateWeekSnapshotResult = {
  semanaId: string | null;
  error: string | null;
};

export type ListSemanasResult = {
  data: SemanaResumo[];
  error: string | null;
};

export type GetSemanaSnapshotResult = {
  semana: SemanaResumo | null;
  data: Demanda[];
  error: string | null;
};

const NOTION_VERSION = "2022-06-28";

function requireEnv() {
  const token = process.env.NOTION_API_KEY;
  const semanasDb = process.env.NOTION_SEMANAS_DB_ID;
  const itensDb = process.env.NOTION_ITENS_DB_ID;
  if (!token || !semanasDb || !itensDb) return null;
  return { token, semanasDb, itensDb };
}

function notionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function richText(prop: any): string {
  if (!prop) return "";
  const arr = prop.rich_text ?? prop.title ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return arr.map((t: any) => t.plain_text ?? "").join("").trim();
}

// Splits text into Notion rich_text blocks, respecting the ~2000-char-per-block limit.
function toRichText(text: string): Array<{ type: "text"; text: { content: string } }> {
  if (!text) return [];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 1900) {
    chunks.push(text.slice(i, i + 1900));
  }
  return chunks.map((c) => ({ type: "text" as const, text: { content: c } }));
}

function labelForWeek(monday: string): string {
  const sunday = addDays(monday, 6);
  const [year, m1, d1] = monday.split("-");
  const [, m2, d2] = sunday.split("-");
  return `${d1}/${m1} – ${d2}/${m2}/${year}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSemanaPage(page: any): SemanaResumo {
  const p = page.properties ?? {};
  return {
    id: page.id,
    label: richText(p["Semana"]) || "Semana",
    dataInicio: p["Data Início"]?.date?.start ?? "",
    dataFim: p["Data Fim"]?.date?.start ?? "",
    criadaEm: page.created_time,
    total: p["Total"]?.number ?? 0,
    concluidas: p["Concluídas"]?.number ?? 0,
    andamento: p["Em Andamento"]?.number ?? 0,
    pendentes: p["Pendentes"]?.number ?? 0,
    urgentes: p["Urgentes"]?.number ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapItemPage(page: any): Demanda {
  const p = page.properties ?? {};
  return {
    id: richText(p["Demanda Origem ID"]) || page.id,
    demanda: richText(p["Demanda"]) || "(sem título)",
    responsavel: richText(p["Responsável"]) || "Não atribuído",
    status: richText(p["Status"]) || "Não iniciado",
    prioridade: richText(p["Prioridade"]) || "Baixa",
    condominio: richText(p["Condomínio"]) || "—",
    area: richText(p["Área"]) || "Sem categoria",
    criadaEm: p["Criada em"]?.date?.start ?? null,
    ultimaAcao: richText(p["Última Ação"]),
    historico: richText(p["Histórico"]),
    ultimaAtualizacao: p["Última Atualização"]?.date?.start ?? page.last_edited_time,
    url: p["URL Original"]?.url ?? "",
  };
}

export const createWeekSnapshot = createServerFn({ method: "POST" }).handler(
  async (): Promise<CreateWeekSnapshotResult> => {
    const env = requireEnv();
    if (!env) {
      return {
        semanaId: null,
        error: "NOTION_SEMANAS_DB_ID / NOTION_ITENS_DB_ID não configurados.",
      };
    }
    const { token, semanasDb, itensDb } = env;

    const { data: demandas, error: fetchError } = await fetchDemandas();
    if (fetchError) {
      return { semanaId: null, error: fetchError };
    }

    const monday = mondayOf(new Date().toISOString());
    const sunday = addDays(monday, 6);
    const label = labelForWeek(monday);

    let concluidas = 0;
    let andamento = 0;
    let pendentes = 0;
    let urgentes = 0;
    demandas.forEach((d) => {
      const bucket = statusBucket(d.status);
      if (bucket === "concluido") concluidas += 1;
      else if (bucket === "andamento") andamento += 1;
      else pendentes += 1;
      if (d.prioridade === "Urgente" && d.status !== "Concluído") urgentes += 1;
    });

    const semanaRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: notionHeaders(token),
      body: JSON.stringify({
        parent: { database_id: semanasDb },
        properties: {
          Semana: { title: [{ text: { content: label } }] },
          "Data Início": { date: { start: monday } },
          "Data Fim": { date: { start: sunday } },
          Total: { number: demandas.length },
          Concluídas: { number: concluidas },
          "Em Andamento": { number: andamento },
          Pendentes: { number: pendentes },
          Urgentes: { number: urgentes },
        },
      }),
    });

    if (!semanaRes.ok) {
      const txt = await semanaRes.text();
      return { semanaId: null, error: `Notion API ${semanaRes.status}: ${txt.slice(0, 300)}` };
    }
    const semanaPage = await semanaRes.json();
    const semanaId: string = semanaPage.id;

    const CONCURRENCY = 3;
    let cursor = 0;
    const itemErrors: string[] = [];

    async function worker() {
      while (cursor < demandas.length) {
        const idx = cursor;
        cursor += 1;
        const d = demandas[idx];
        const res = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: notionHeaders(token),
          body: JSON.stringify({
            parent: { database_id: itensDb },
            properties: {
              Demanda: { title: [{ text: { content: d.demanda || "(sem título)" } }] },
              Semana: { relation: [{ id: semanaId }] },
              "Responsável": { rich_text: toRichText(d.responsavel) },
              Status: { rich_text: toRichText(d.status) },
              Prioridade: { rich_text: toRichText(d.prioridade) },
              "Condomínio": { rich_text: toRichText(d.condominio) },
              "Área": { rich_text: toRichText(d.area) },
              "Criada em": d.criadaEm ? { date: { start: d.criadaEm } } : { date: null },
              "Última Ação": { rich_text: toRichText(d.ultimaAcao) },
              "Histórico": { rich_text: toRichText(d.historico) },
              "Última Atualização": { date: { start: d.ultimaAtualizacao } },
              "URL Original": d.url ? { url: d.url } : { url: null },
              "Demanda Origem ID": { rich_text: toRichText(d.id) },
            },
          }),
        });
        if (!res.ok) {
          const txt = await res.text();
          itemErrors.push(`${d.demanda}: ${res.status} ${txt.slice(0, 150)}`);
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, demandas.length) }, () => worker()),
    );

    if (itemErrors.length > 0) {
      return {
        semanaId,
        error: `Semana criada, mas ${itemErrors.length} item(ns) falharam ao salvar: ${itemErrors[0]}`,
      };
    }

    return { semanaId, error: null };
  },
);

export const listSemanas = createServerFn({ method: "GET" }).handler(
  async (): Promise<ListSemanasResult> => {
    const env = requireEnv();
    if (!env) return { data: [], error: "NOTION_SEMANAS_DB_ID não configurado." };
    const { token, semanasDb } = env;

    try {
      const res = await fetch(`https://api.notion.com/v1/databases/${semanasDb}/query`, {
        method: "POST",
        headers: notionHeaders(token),
        body: JSON.stringify({
          sorts: [{ property: "Data Início", direction: "descending" }],
          page_size: 100,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        return { data: [], error: `Notion API ${res.status}: ${txt.slice(0, 300)}` };
      }
      const json = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: SemanaResumo[] = (json.results ?? []).map((page: any) => mapSemanaPage(page));
      return { data, error: null };
    } catch (e) {
      return { data: [], error: e instanceof Error ? e.message : "Erro desconhecido" };
    }
  },
);

export const getSemanaSnapshot = createServerFn({ method: "GET" })
  .validator((id: unknown): string => {
    if (typeof id !== "string" || id.length === 0) {
      throw new Error("semanaId inválido");
    }
    return id;
  })
  .handler(async ({ data: semanaId }): Promise<GetSemanaSnapshotResult> => {
    const env = requireEnv();
    if (!env) {
      return { semana: null, data: [], error: "Databases de histórico não configuradas." };
    }
    const { token, itensDb } = env;

    try {
      const semanaRes = await fetch(`https://api.notion.com/v1/pages/${semanaId}`, {
        headers: notionHeaders(token),
      });
      if (!semanaRes.ok) {
        if (semanaRes.status === 404) {
          return { semana: null, data: [], error: "Semana não encontrada." };
        }
        const txt = await semanaRes.text();
        return { semana: null, data: [], error: `Notion API ${semanaRes.status}: ${txt.slice(0, 300)}` };
      }
      const semana = mapSemanaPage(await semanaRes.json());

      const items: Demanda[] = [];
      let cursor: string | undefined;
      let hasMore = true;
      while (hasMore) {
        const body: Record<string, unknown> = {
          filter: { property: "Semana", relation: { contains: semanaId } },
          page_size: 100,
        };
        if (cursor) body.start_cursor = cursor;

        const res = await fetch(`https://api.notion.com/v1/databases/${itensDb}/query`, {
          method: "POST",
          headers: notionHeaders(token),
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const txt = await res.text();
          return { semana, data: [], error: `Notion API ${res.status}: ${txt.slice(0, 300)}` };
        }
        const json = await res.json();
        for (const page of json.results ?? []) {
          items.push(mapItemPage(page));
        }
        hasMore = json.has_more;
        cursor = json.next_cursor ?? undefined;
      }

      return { semana, data: items, error: null };
    } catch (e) {
      return {
        semana: null,
        data: [],
        error: e instanceof Error ? e.message : "Erro desconhecido ao consultar o Notion",
      };
    }
  });
