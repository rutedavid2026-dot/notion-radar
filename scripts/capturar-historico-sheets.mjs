#!/usr/bin/env node
// Faz o mesmo trabalho de capturarTodasFotografias (apps-script/CapturaSemanal.gs
// + NotionFollowups.gs), mas escrevendo na planilha via Google Sheets API (Service
// Account) em vez de SpreadsheetApp/UrlFetchApp do Apps Script.
//
// Motivo: a cota diária de UrlFetchApp da conta Google (20 mil chamadas/dia,
// contas free) esgotou em 2026-08-24 e bloqueou toda captura pelo Apps Script até
// a virada do dia no fuso do Google. Rodando por aqui (Node, fora do Apps
// Script), nenhuma dessas chamadas conta pra aquela cota — nem a leitura no
// Notion (fetch comum), nem a escrita na planilha (Sheets API, cota própria e
// bem maior).
//
// Setup necessário (uma vez):
//   1. Criar uma Service Account no Google Cloud Console com a Sheets API
//      ativada (ver instruções dadas no chat).
//   2. Compartilhar a planilha "base-gestao-em-movimento" com o e-mail
//      "client_email" dessa Service Account, como Editor.
//   3. Salvar o JSON da chave baixada em algum lugar local (fora do repo) e
//      apontar GOOGLE_SERVICE_ACCOUNT_KEY_FILE pra esse caminho.
//
// Uso local:
//   GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/caminho/para/chave.json \
//   NOTION_API_KEY=ntn_... \
//   [NOTION_API_KEY_2=ntn_...] \
//   [REGISTRY_SPREADSHEET_ID=...] \
//   node scripts/capturar-historico-sheets.mjs
//
// No GitHub Actions (.github/workflows/capturar-historico-sheets.yml): usa
// GOOGLE_SERVICE_ACCOUNT_KEY (o JSON inteiro da chave, direto do secret) em
// vez de GOOGLE_SERVICE_ACCOUNT_KEY_FILE.
//
// Escopo: captura de demandas por condomínio (aba de histórico) + registro/
// espelho em "Follow-up da semana" e na database Notion "Relatórios
// Semanais". NÃO inclui "Outros Follow-ups" (Plano de Ação Vivendas) — isso
// continua só na captura semanal via Apps Script.

import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";

const SPREADSHEET_ID =
  process.env.REGISTRY_SPREADSHEET_ID || "1fEkPgTf6oGYknWEP6zzi8eyBTpoDDQR0goJg1D_Wed0";
const CONFIG_SHEET_NAME = "_configuracao";
const FOLLOWUP_SHEET_NAME = "Follow-up da semana";
const NOTION_FOLLOWUPS_DB_ID = "3c1e69ba114f8020b465f0db2be179ee";
const NOTION_VERSION = "2022-06-28";
const WEEK_ANCHOR = "2025-12-27";
const BASE_URL = "https://equipesindicas.lovable.app";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

const HEADERS_HISTORICO = [
  "SemanaN",
  "SemanaInicio",
  "SemanaFim",
  "CapturadoEm",
  "Condominio",
  "Tarefa",
  "Responsavel",
  "Status",
  "Prioridade",
  "Setor",
  "DataInicio",
  "CriadaEm",
  "UltimaAtualizacao",
  "Historico",
  "DataUltimaEdicao",
  "URL",
  "PageId",
  "Ordem",
  "PrevisaoEmDias",
  "DataPrevisaoConclusao",
  "DataConclusao",
  "SituacaoPrazo",
];

// ---------- Auth (Service Account -> access token via JWT) ----------

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signJwt(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = base64url(signer.sign(serviceAccount.private_key));
  return `${unsigned}.${signature}`;
}

async function getAccessToken(serviceAccount) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signJwt(serviceAccount),
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("Falha ao obter access token do Google: " + JSON.stringify(json));
  return json.access_token;
}

// ---------- Sheets API ----------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A cota de escrita do Sheets API é por minuto — 29 condomínios em sequência
// rápida (cada um com 2-4 escritas: deletar+gravar na aba de histórico e no
// follow-up) estourou o limite no teste de 2026-08-24. Em vez de throttle
// manual (frágil, depende de acertar o ritmo certo), detecta o erro de cota e
// espera a janela de um minuto virar antes de tentar de novo.
async function sheetsFetch(token, path, options = {}, tentativa = 0) {
  const res = await fetch(`${SHEETS_API}/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers },
  });
  const json = await res.json();
  if (json.error) {
    const cota = /quota exceeded/i.test(json.error.message || "");
    if (cota && tentativa < 3) {
      console.log(`  ⏳ Cota do Sheets API estourada, aguardando 65s pra tentar de novo (tentativa ${tentativa + 1}/3)...`);
      await sleep(65_000);
      return sheetsFetch(token, path, options, tentativa + 1);
    }
    throw new Error("Sheets API: " + json.error.message);
  }
  return json;
}

async function getSpreadsheetMeta(token) {
  return sheetsFetch(token, `${SPREADSHEET_ID}?fields=sheets.properties`);
}

function tituloPorGid(meta, gid) {
  const alvo = Number(gid);
  const sheet = meta.sheets.find((s) => s.properties.sheetId === alvo);
  return sheet ? sheet.properties.title : null;
}

async function getValues(token, range, valueRenderOption) {
  const query = valueRenderOption ? `?valueRenderOption=${valueRenderOption}` : "";
  const json = await sheetsFetch(token, `${SPREADSHEET_ID}/values/${encodeURIComponent(range)}${query}`);
  return json.values || [];
}

async function appendValues(token, range, rows) {
  if (rows.length === 0) return;
  await sheetsFetch(
    token,
    `${SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
    { method: "POST", body: JSON.stringify({ values: rows }) },
  );
}

async function deleteRows(token, sheetId, rowIndices0based) {
  if (rowIndices0based.length === 0) return;
  const requests = [...rowIndices0based]
    .sort((a, b) => b - a) // maior índice primeiro, senão deletar desalinha os próximos
    .map((rowIndex) => ({
      deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 } },
    }));
  await sheetsFetch(token, `${SPREADSHEET_ID}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

// Linhas de data podem voltar como número de série (formatação de data já
// aplicada na coluna) ou como texto "yyyy-MM-dd" — normaliza pros dois casos.
function serialToIsoDate(serial) {
  const ms = Math.round((Number(serial) - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}
function valorParaIso(valor) {
  if (valor == null || valor === "") return null;
  if (typeof valor === "number") return serialToIsoDate(valor);
  return String(valor).slice(0, 10);
}

// Remove da aba as linhas cuja coluna B (SemanaInicio) bate com a semana
// atual — mesmo padrão de removerSemanaExistente (CapturaSemanal.gs), só que
// via Sheets API (values.get + batchUpdate deleteDimension) em vez de
// sheet.deleteRow.
async function removerSemanaExistente(token, sheetId, sheetTitle, semanaInicioIso) {
  const colB = await getValues(token, `'${sheetTitle}'!B2:B`, "UNFORMATTED_VALUE");
  const indices = [];
  colB.forEach((row, i) => {
    if (valorParaIso(row[0]) === semanaInicioIso) indices.push(i + 1); // +1: linha 0 é o cabeçalho
  });
  await deleteRows(token, sheetId, indices);
}

// ---------- Notion (mesma lógica de CapturaSemanal.gs, duplicada de
// propósito — este script roda isolado, sem depender do runtime do app nem
// do Apps Script; mesmo padrão de scripts/sync-followups-notion.mjs) ----------

function getNotionTokens() {
  return ["NOTION_API_KEY", "NOTION_API_KEY_2", "NOTION_API_KEY_3"]
    .map((key) => process.env[key])
    .filter(Boolean);
}

// Descobre qual dos tokens (NOTION_API_KEY/_2/_3) enxerga a database
// "Relatórios Semanais" — mesmo padrão de encontrarTokenFollowUpsNotion em
// apps-script/NotionFollowups.gs. NOTION_API_KEY_RELATORIO_SEMANAL (env var
// separada) é pra outra finalidade (automação de opções de Status via curl,
// ver apps-script/prompt-padronizacao-notion.md) — não confundir os dois,
// erro corrigido depois de testar em 2026-08-24.
async function encontrarTokenRelatorioSemanal(tokens) {
  for (const token of tokens) {
    try {
      await notionFetch(token, `databases/${NOTION_FOLLOWUPS_DB_ID}`);
      return token;
    } catch {
      // tenta o próximo
    }
  }
  return null;
}

async function notionQuery(token, databaseId) {
  const headers = { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
  const results = [];
  let cursor;
  do {
    const body = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) };
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.object === "error") throw new Error("Notion API: " + json.message);
    results.push(...json.results);
    cursor = json.has_more ? json.next_cursor : null;
  } while (cursor);
  return results;
}

async function buscarDemandasComTokens(tokens, databaseId, condominio) {
  let ultimoErro = null;
  for (const token of tokens) {
    try {
      const pages = await notionQuery(token, databaseId);
      return pages.map((page) => mapPage(page, condominio));
    } catch (err) {
      ultimoErro = err;
    }
  }
  throw ultimoErro;
}

function richText(prop) {
  if (!prop) return "";
  const arr = prop.rich_text ?? prop.title ?? [];
  return arr.map((t) => t.plain_text ?? "").join("").trim();
}
function selectName(prop) {
  return prop?.select?.name || "";
}
function numberValue(prop) {
  return typeof prop?.number === "number" ? prop.number : null;
}
function statusValue(prop) {
  return prop?.status?.name || prop?.select?.name || "";
}
function multiSelectJoined(prop) {
  return Array.isArray(prop?.multi_select) ? prop.multi_select.map((s) => s.name).join(", ") : "";
}
function prioridadeValue(prop) {
  if (!prop) return "";
  return multiSelectJoined(prop) || prop.select?.name || "";
}
function personValue(prop) {
  if (!prop) return "";
  if (Array.isArray(prop.people)) return prop.people.map((p) => p.name || "").join(", ");
  return multiSelectJoined(prop) || prop.select?.name || richText(prop);
}
function createdValue(prop) {
  if (!prop) return null;
  if (typeof prop.created_time === "string") return prop.created_time;
  return prop.date?.start || null;
}
function dateValue(prop) {
  return prop?.date?.start || null;
}
function formulaValue(prop) {
  const f = prop?.formula;
  if (!f) return null;
  if (f.type === "date") return f.date?.start || null;
  if (f.type === "string") return f.string || null;
  return null;
}

function mapPage(page, condominioOverride) {
  const p = page.properties || {};
  return {
    id: page.id,
    demanda: richText(p["Demanda"]) || richText(p["Tarefas"]) || richText(p["TAREFAS"]) || "(sem titulo)",
    responsavel: personValue(p["Pessoa"]) || personValue(p["Responsável"]) || "Não atribuído",
    status: statusValue(p["Status"]) || statusValue(p["Status "]) || "Nao iniciado",
    prioridade: prioridadeValue(p["Prioridade"]) || "Baixa",
    condominio: condominioOverride || selectName(p["Condomínio"]) || "-",
    area:
      richText(p["Área"]) ||
      selectName(p["Área"]) ||
      multiSelectJoined(p["Setor/Demanda"]) ||
      multiSelectJoined(p["Setor"]) ||
      selectName(p["Setor"]) ||
      "Sem categoria",
    dataInicio: dateValue(p["Data de Início"]) || dateValue(p["Início"]) || "",
    criadaEm:
      dateValue(p["Data de Início"]) ||
      dateValue(p["Início"]) ||
      createdValue(p["Criada em"]) ||
      createdValue(p["Criado em"]) ||
      "",
    ultimaAtualizacao: richText(p["Última Atualização"]) || richText(p["Última Ação"]),
    historico: richText(p["Histórico"]) || richText(p["Histórico/Evidências"]),
    dataUltimaEdicao: page.last_edited_time,
    url: page.url,
    ordem: numberValue(p["Ordem"]) ?? "",
    previsao: numberValue(p["Previsão (em dias)"]) ?? numberValue(p["Previsão"]) ?? dateValue(p["Previsão"]) ?? "",
    dataPrevista:
      dateValue(p["Data Prevista"]) ||
      formulaValue(p["Data Prevista"]) ||
      formulaValue(p["Data Prevista de Conclusão"]) ||
      "",
    concluidoEm:
      dateValue(p["Concluído em"]) || dateValue(p["Data de conclusão"]) || dateValue(p["Data de Conclusão"]) || "",
    situacaoPrazo: formulaValue(p["Situação do Prazo"]) || richText(p["Situação do Prazo"]) || "",
  };
}

// ---------- Semana / links (mesmo cálculo de CapturaSemanal.gs/Config.gs) ----------

function formatIso(d) {
  return d.toISOString().slice(0, 10);
}
function semanaAtual() {
  const hojeLocal = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const hoje = new Date(hojeLocal + "T00:00:00Z");
  const anchor = new Date(WEEK_ANCHOR + "T00:00:00Z");
  const diffDays = Math.floor((hoje.getTime() - anchor.getTime()) / 86400000);
  const n = Math.max(1, Math.floor(diffDays / 7) + 1);
  const start = new Date(anchor.getTime() + (n - 1) * 7 * 86400000);
  const end = new Date(start.getTime() + 6 * 86400000);
  return { n, start: formatIso(start), end: formatIso(end) };
}
function formatDataBr(isoDate) {
  const partes = String(isoDate || "").split("-");
  return partes.length === 3 ? `${partes[2]}-${partes[1]}-${partes[0]}` : "";
}
function montarLinkFollowUp(id, semanaInicio, semanaFim) {
  return `${BASE_URL}/${id}?semanainicio=${formatDataBr(semanaInicio)}&semanafim=${formatDataBr(semanaFim)}`;
}

// ---------- Espelho Notion "Relatórios Semanais" (mesmo schema de
// scripts/sync-followups-notion.mjs) ----------

async function notionFetch(token, path, options = {}) {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const json = await res.json();
  if (json.object === "error") throw new Error("Notion API: " + json.message);
  return json;
}

async function buscarPaginaFollowUpExistente(token, condominio, semanaN) {
  const body = {
    filter: {
      and: [
        { property: "Condominio", title: { equals: condominio } },
        { property: "Semana", number: { equals: semanaN } },
      ],
    },
    page_size: 2,
  };
  const json = await notionFetch(token, `databases/${NOTION_FOLLOWUPS_DB_ID}/query`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return json.results?.[0] || null;
}

async function sincronizarFollowUpNotion(token, condominio, semana, link) {
  const properties = {
    Condominio: { title: [{ text: { content: condominio } }] },
    Semana: { number: semana.n },
    "Intervalo de Semana": { date: { start: semana.start, end: semana.end } },
    "Link do Report": { url: link },
  };
  const existente = await buscarPaginaFollowUpExistente(token, condominio, semana.n);
  if (existente) {
    await notionFetch(token, `pages/${existente.id}`, { method: "PATCH", body: JSON.stringify({ properties }) });
  } else {
    await notionFetch(token, "pages", {
      method: "POST",
      body: JSON.stringify({ parent: { database_id: NOTION_FOLLOWUPS_DB_ID }, properties }),
    });
  }
}

// ---------- Main ----------

async function main() {
  // Local: aponta pra um arquivo (chave nunca vai pro git). No GitHub Actions
  // é mais simples guardar o JSON inteiro como secret e passar inline.
  const keyInline = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (!keyInline && !keyFile) {
    throw new Error("Defina GOOGLE_SERVICE_ACCOUNT_KEY (JSON inline) ou GOOGLE_SERVICE_ACCOUNT_KEY_FILE (caminho pro arquivo).");
  }
  const serviceAccount = JSON.parse(keyInline || readFileSync(keyFile, "utf8"));

  const notionTokens = getNotionTokens();
  if (notionTokens.length === 0) throw new Error("Defina NOTION_API_KEY (e opcionalmente _2/_3).");
  const tokenRelatorioSemanal = await encontrarTokenRelatorioSemanal(notionTokens);
  if (!tokenRelatorioSemanal) {
    console.log("Aviso: nenhum token enxerga a database 'Relatórios Semanais' — pulando esse espelho.");
  }

  console.log("Autenticando com o Google...");
  const token = await getAccessToken(serviceAccount);

  console.log("Lendo metadados da planilha...");
  const meta = await getSpreadsheetMeta(token);

  console.log("Lendo aba de configuração...");
  const linhas = await getValues(token, `'${CONFIG_SHEET_NAME}'!A2:D`);

  const semana = semanaAtual();
  console.log(`Semana atual: #${semana.n} (${semana.start} a ${semana.end})`);

  const erros = [];
  let processados = 0;

  for (const row of linhas) {
    const condominio = String(row[0] || "").trim();
    const url = String(row[1] || "").trim();
    const gid = row[2];
    const id = String(row[3] || "").trim();
    if (!condominio || !url || !gid) continue;

    const dbId = url.match(/[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}/)?.[0]?.replace(/-/g, "");
    if (!dbId) continue;

    const sheetTitle = tituloPorGid(meta, gid);
    if (!sheetTitle) {
      erros.push(`${condominio}: aba (gid ${gid}) não encontrada.`);
      continue;
    }
    const sheetId = Number(gid);

    try {
      console.log(`Buscando demandas de ${condominio}...`);
      const demandas = await buscarDemandasComTokens(notionTokens, dbId, condominio);
      const capturadoEm = new Date().toISOString();

      const rows = demandas.map((d) => [
        semana.n,
        semana.start,
        semana.end,
        capturadoEm,
        d.condominio,
        d.demanda,
        d.responsavel,
        d.status,
        d.prioridade,
        d.area,
        d.dataInicio,
        d.criadaEm,
        d.ultimaAtualizacao,
        d.historico,
        d.dataUltimaEdicao,
        d.url,
        d.id,
        d.ordem,
        d.previsao,
        d.dataPrevista,
        d.concluidoEm,
        d.situacaoPrazo,
      ]);

      await removerSemanaExistente(token, sheetId, sheetTitle, semana.start);
      await appendValues(token, `'${sheetTitle}'!A1:${String.fromCharCode(64 + HEADERS_HISTORICO.length)}`, rows);
      console.log(`  ✅ ${rows.length} demanda(s) gravada(s) em '${sheetTitle}'.`);

      if (id) {
        const link = montarLinkFollowUp(id, semana.start, semana.end);
        // Registra/atualiza a linha na aba "Follow-up da semana"
        const followupColAB = await getValues(token, `'${FOLLOWUP_SHEET_NAME}'!A2:B`, "UNFORMATTED_VALUE");
        const indicesExistentes = [];
        followupColAB.forEach((r, i) => {
          if (String(r[0] || "") === condominio && Number(r[1]) === semana.n) indicesExistentes.push(i + 1);
        });
        const followupSheet = meta.sheets.find((s) => s.properties.title === FOLLOWUP_SHEET_NAME);
        if (followupSheet) {
          await deleteRows(token, followupSheet.properties.sheetId, indicesExistentes);
        }
        await appendValues(token, `'${FOLLOWUP_SHEET_NAME}'!A1:E`, [
          [condominio, semana.n, link, semana.start, semana.end],
        ]);

        if (tokenRelatorioSemanal) {
          try {
            await sincronizarFollowUpNotion(tokenRelatorioSemanal, condominio, semana, link);
          } catch (err) {
            erros.push(`${condominio} (espelho Notion Relatórios Semanais): ${err.message}`);
          }
        }
      }

      processados++;
    } catch (err) {
      erros.push(`${condominio}: ${err.message}`);
      console.log(`  ❌ ${condominio}: ${err.message}`);
    }
  }

  console.log(`\n✅ ${processados} condomínio(s) processado(s).`);
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
