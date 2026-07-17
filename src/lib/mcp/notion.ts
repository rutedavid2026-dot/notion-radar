// Server-only Notion data helper for MCP tools. Import lazily inside handlers.

export type Demanda = {
  id: string;
  demanda: string;
  responsavel: string;
  status: string;
  prioridade: string;
  condominio: string;
  area: string;
  criadaEm: string | null;
  ultimaAcao: string;
  historico: string;
  ultimaAtualizacao: string;
  url: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function richText(prop: any): string {
  if (!prop) return "";
  const arr = prop.rich_text ?? prop.title ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return arr.map((t: any) => t.plain_text ?? "").join("").trim();
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function selectName(prop: any): string {
  return prop?.select?.name ?? "";
}

export async function fetchDemandas(): Promise<{ data: Demanda[]; error: string | null }> {
  const token = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!token || !dbId) {
    return { data: [], error: "NOTION_API_KEY / NOTION_DATABASE_ID not configured" };
  }
  try {
    const all: Demanda[] = [];
    let cursor: string | undefined;
    let hasMore = true;
    while (hasMore) {
      const body: Record<string, unknown> = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return { data: [], error: `Notion API ${res.status}: ${(await res.text()).slice(0, 300)}` };
      }
      const json = await res.json();
      for (const page of json.results ?? []) {
        const p = page.properties ?? {};
        all.push({
          id: page.id,
          demanda: richText(p["Demanda"]) || "(sem título)",
          responsavel: richText(p["Pessoa"]) || "Não atribuído",
          status: selectName(p["Status"]) || "Não iniciado",
          prioridade: selectName(p["Prioridade"]) || "Baixa",
          condominio: selectName(p["Condomínio"]) || "—",
          area: richText(p["Área"]) || "Sem categoria",
          criadaEm: p["Criada em"]?.date?.start ?? null,
          ultimaAcao: richText(p["Última Ação"]),
          historico: richText(p["Histórico"]),
          ultimaAtualizacao: page.last_edited_time,
          url: page.url,
        });
      }
      hasMore = json.has_more;
      cursor = json.next_cursor ?? undefined;
    }
    return { data: all, error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : "Unknown error" };
  }
}
