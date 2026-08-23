#!/usr/bin/env node
// Sincroniza a aba "Follow-up da semana" (Google Sheets, lida via export CSV
// público — sem credenciais do Google) com a database "Gestão em Movimento -
// Relatórios Semanais" no Notion.
//
// Roda via GitHub Actions (.github/workflows/sync-followups-notion.yml),
// independente do Apps Script — o Apps Script tem cota diária de
// UrlFetchApp (20 mil chamadas/dia numa conta free) que estourou fazendo o
// backfill do histórico completo; aqui não há esse limite, e dá pra rodar a
// qualquer momento pelo botão "Run workflow" no GitHub, sem depender do
// editor do Apps Script.
//
// Uso local: NOTION_TOKEN=ntn_... node scripts/sync-followups-notion.mjs

const SPREADSHEET_ID =
  process.env.REGISTRY_SPREADSHEET_ID || "1fEkPgTf6oGYknWEP6zzi8eyBTpoDDQR0goJg1D_Wed0";
const FOLLOWUPS_GID = process.env.FOLLOWUPS_GID || "1720412368";
const NOTION_FOLLOWUPS_DB_ID = "3c1e69ba114f8020b465f0db2be179ee";
const NOTION_VERSION = "2022-06-28";
const NOTION_TOKEN = process.env.NOTION_TOKEN;

if (!NOTION_TOKEN) {
  console.error("Defina NOTION_TOKEN (secret do GitHub Actions ou variável de ambiente local).");
  process.exit(1);
}

// Mesmo parser CSV mínimo (RFC4180) de src/lib/sheets.functions.ts, duplicado
// de propósito pra manter este script standalone (sem depender do runtime do
// TanStack Start pra rodar em CI).
function parseCsv(text) {
  const rows = [];
  let row = [];
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

async function fetchFollowUpsCsv() {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${FOLLOWUPS_GID}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao ler planilha: HTTP ${res.status}`);
  return parseCsv(await res.text());
}

function col(header, ...names) {
  for (const name of names) {
    const i = header.indexOf(name);
    if (i !== -1) return i;
  }
  return -1;
}

async function notionFetch(path, options = {}) {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const json = await res.json();
  if (json.object === "error") {
    throw new Error(`Notion API: ${json.message || res.statusText}`);
  }
  return json;
}

// Pagina a database inteira uma vez e monta um mapa "condominio|||semana" ->
// pageId, pra decidir criar/atualizar sem uma query por linha (mesma
// otimização de apps-script/NotionFollowups.gs).
async function fetchTodasPaginasExistentes() {
  const mapa = new Map();
  let cursor;
  do {
    const body = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) };
    const json = await notionFetch(`databases/${NOTION_FOLLOWUPS_DB_ID}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    for (const page of json.results) {
      const titulo = page.properties.Condominio.title;
      const nome = titulo.length > 0 ? titulo[0].plain_text : "";
      const semana = page.properties.Semana.number;
      if (nome && semana != null) mapa.set(`${nome}|||${semana}`, page.id);
    }
    cursor = json.has_more ? json.next_cursor : null;
  } while (cursor);
  return mapa;
}

function montarPropriedades(condominio, semana, dataInicio, dataFim, link) {
  return {
    Condominio: { title: [{ text: { content: condominio } }] },
    Semana: { number: semana },
    "Intervalo de Semana": { date: { start: dataInicio, end: dataFim } },
    "Link dto Report": { url: link },
  };
}

async function main() {
  console.log("Lendo planilha de follow-ups...");
  const [header, ...body] = await fetchFollowUpsCsv();
  if (!header) {
    console.log("Planilha vazia.");
    return;
  }

  const iCondominio = col(header, "condominio", "condomínio", "Condominio", "Condomínio");
  const iSemana = col(header, "semana", "Semana");
  const iLink = col(header, "link-follow-up", "URL");
  const iInicio = col(header, "data-inicio", "Data Início");
  const iTermino = col(header, "data-termino", "Data Término");

  const linhas = body
    .map((r) => ({
      condominio: (r[iCondominio] ?? "").trim(),
      semana: Number((r[iSemana] ?? "").trim()),
      link: (r[iLink] ?? "").trim(),
      dataInicio: (r[iInicio] ?? "").trim(),
      dataFim: (r[iTermino] ?? "").trim(),
    }))
    .filter((r) => r.condominio && Number.isFinite(r.semana) && r.link);

  console.log(`${linhas.length} linha(s) na planilha.`);

  console.log("Buscando páginas já existentes no Notion...");
  const existentes = await fetchTodasPaginasExistentes();
  console.log(`${existentes.size} página(s) já existentes na database.`);

  let criadas = 0;
  let atualizadas = 0;
  const erros = [];

  for (const linha of linhas) {
    const chave = `${linha.condominio}|||${linha.semana}`;
    const properties = montarPropriedades(
      linha.condominio,
      linha.semana,
      linha.dataInicio,
      linha.dataFim,
      linha.link,
    );
    try {
      const pageId = existentes.get(chave);
      if (pageId) {
        await notionFetch(`pages/${pageId}`, { method: "PATCH", body: JSON.stringify({ properties }) });
        atualizadas++;
      } else {
        const pagina = await notionFetch("pages", {
          method: "POST",
          body: JSON.stringify({ parent: { database_id: NOTION_FOLLOWUPS_DB_ID }, properties }),
        });
        existentes.set(chave, pagina.id);
        criadas++;
      }
    } catch (err) {
      erros.push(`${linha.condominio} (semana ${linha.semana}): ${err.message}`);
    }
  }

  console.log(`✅ ${criadas} criada(s), ${atualizadas} atualizada(s).`);
  if (erros.length > 0) {
    console.log(`❌ ${erros.length} falha(s):`);
    erros.forEach((e) => console.log(" - " + e));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
