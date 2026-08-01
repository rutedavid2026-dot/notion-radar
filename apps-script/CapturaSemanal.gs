// Captura semanal generalizada: lê a aba "Configuração" e, para cada
// condomínio já configurado (com a coluna "Aba" preenchida com o GID), consulta
// a respectiva database do Notion e grava a fotografia da semana na aba dele.
//
// Substitui o antigo "capturarFotografiaSemanal" (que escrevia tudo numa
// única aba "Historico" compartilhada por todos os condomínios) — a lógica de
// captura e de remover/regravar a semana atual é a mesma de antes, só passou
// a rodar em loop, uma vez por condomínio cadastrado.
//
// Script Properties necessárias: NOTION_API_KEY (mesma integração, token
// único compartilhado por todas as databases dos condomínios).
//
// Trigger: time-driven, semanal (o mesmo horário que já era usado antes para
// capturarFotografiaSemanal) → função capturarTodasFotografias.

const NOTION_VERSION = "2022-06-28";
const WEEK_ANCHOR = "2025-12-27";

function capturarTodasFotografias() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("NOTION_API_KEY");
  if (!token) {
    throw new Error("Configure NOTION_API_KEY em Script Properties.");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!configSheet) {
    throw new Error("Aba '" + CONFIG_SHEET_NAME + "' não encontrada.");
  }

  const lastRow = configSheet.getLastRow();
  if (lastRow < 2) return;

  const linhas = configSheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const erros = [];
  const semana = semanaAtual();
  const followupSheet = getOrCreateFollowupSheet(ss);

  linhas.forEach(function (row) {
    const condominio = String(row[0] || "").trim();
    const url = String(row[1] || "").trim();
    const gid = row[2];
    if (!condominio || !url || !gid) return; // condomínio ainda não configurado

    const dbId = extrairDatabaseId(url);
    if (!dbId) return;

    const sheet = getSheetByGid(ss, gid);
    if (!sheet) {
      erros.push(condominio + ": aba (gid " + gid + ") não encontrada.");
      return;
    }

    try {
      capturarFotografiaCondominio(ss, sheet, token, dbId, condominio);
      registrarFollowUpSemana(followupSheet, condominio, semana);
    } catch (err) {
      erros.push(condominio + ": " + err.message);
    }
  });

  if (erros.length > 0) {
    Logger.log("Falhas na captura semanal:\n" + erros.join("\n"));
  }
}

// Execução única (rodar manualmente pelo editor Apps Script, uma vez):
// (re)cria o trigger de tempo semanal que dispara capturarTodasFotografias.
// Idempotente — remove qualquer trigger anterior apontando pra essa função
// (ou pro nome antigo, capturarFotografiaSemanal) antes de criar o novo, pra
// nunca duplicar execuções. Toda sexta-feira, entre 8h e 9h (horário do fuso
// do projeto, America/Sao_Paulo — ver appsscript.json).
function configurarTriggerSemanal() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const fn = t.getHandlerFunction();
    if (fn === "capturarTodasFotografias" || fn === "capturarFotografiaSemanal") {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger("capturarTodasFotografias")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(8)
    .create();
  Logger.log("✅ Trigger semanal configurado: capturarTodasFotografias, toda sexta-feira entre 8h e 9h.");
}

// Captura a fotografia da semana atual de UM condomínio e grava na aba dele.
// Compartilhada entre a captura semanal (loop acima) e a captura inicial
// disparada assim que a aba é criada (GerenciarCondominios.gs), pra não
// deixar o condomínio novo sem dado nenhum até a próxima sexta-feira.
function capturarFotografiaCondominio(ss, sheet, token, dbId, condominio) {
  const semana = semanaAtual();
  const capturadoEm = new Date();
  const demandas = buscarDemandas(token, dbId, condominio);
  removerSemanaExistente(sheet, semana.start);
  const rows = demandas.map(function (d) {
    return [
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
    ];
  });
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function semanaAtual() {
  const anchor = new Date(WEEK_ANCHOR + "T00:00:00Z");
  const diffDays = Math.floor((Date.now() - anchor.getTime()) / 86400000);
  const n = Math.max(1, Math.floor(diffDays / 7) + 1);
  const start = new Date(anchor.getTime() + (n - 1) * 7 * 86400000);
  const end = new Date(start.getTime() + 6 * 86400000);
  return { n: n, start: formatIso(start), end: formatIso(end) };
}

function formatIso(d) {
  return Utilities.formatDate(d, "UTC", "yyyy-MM-dd");
}

function removerSemanaExistente(sheet, semanaInicio) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const values = sheet.getRange(2, 2, lastRow - 1, 1).getValues(); // coluna B = SemanaInicio
  for (let i = values.length - 1; i >= 0; i--) {
    if (formatIso(new Date(values[i][0])) === semanaInicio) {
      sheet.deleteRow(i + 2);
    }
  }
}

function buscarDemandas(token, databaseId, condominioOverride) {
  const headers = { Authorization: "Bearer " + token, "Notion-Version": NOTION_VERSION };
  const results = [];
  let cursor = null;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = UrlFetchApp.fetch("https://api.notion.com/v1/databases/" + databaseId + "/query", {
      method: "post",
      headers: headers,
      contentType: "application/json",
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    });
    const json = JSON.parse(res.getContentText());
    if (json.object === "error") {
      throw new Error("Notion API: " + (json.message || res.getContentText()));
    }
    (json.results || []).forEach(function (page) {
      results.push(mapPage(page, condominioOverride));
    });
    cursor = json.has_more ? json.next_cursor : null;
  } while (cursor);
  return results;
}

function mapPage(page, condominioOverride) {
  const p = page.properties || {};
  return {
    id: page.id,
    demanda:
      richText(p["Demanda"]) || richText(p["Tarefas"]) || richText(p["TAREFAS"]) || "(sem titulo)",
    responsavel: personValue(p["Pessoa"]) || personValue(p["Responsável"]) || "Nao atribuido",
    status: statusValue(p["Status"]) || "Nao iniciado",
    prioridade: prioridadeValue(p["Prioridade"]) || "Baixa",
    condominio: condominioOverride || selectName(p["Condomínio"]) || "-",
    area: richText(p["Área"]) || multiSelectJoined(p["Setor/Demanda"]) || "Sem categoria",
    criadaEm: createdValue(p["Criada em"]) || createdValue(p["Criado em"]) || "",
    ultimaAtualizacao: richText(p["Última Atualização"]),
    historico: richText(p["Histórico"]) || richText(p["Histórico/Evidências"]),
    dataUltimaEdicao: page.last_edited_time,
    url: page.url,
    ordem: p["Ordem"] && typeof p["Ordem"].number === "number" ? p["Ordem"].number : "",
    previsao: (p["Previsão"] && p["Previsão"].date && p["Previsão"].date.start) || "",
    dataPrevista:
      (p["Data Prevista"] && p["Data Prevista"].date && p["Data Prevista"].date.start) || "",
    concluidoEm:
      (p["Concluído em"] && p["Concluído em"].date && p["Concluído em"].date.start) || "",
  };
}

function richText(prop) {
  if (!prop) return "";
  const arr = prop.rich_text || prop.title || [];
  return arr
    .map(function (t) {
      return t.plain_text || "";
    })
    .join("")
    .trim();
}

function selectName(prop) {
  return (prop && prop.select && prop.select.name) || "";
}

// "Status" pode ser select clássico ou o tipo "status" mais novo do Notion
// (ex.: Vivendas Home Club) — shape do JSON muda (`prop.status.name`).
function statusValue(prop) {
  return (prop && prop.status && prop.status.name) || (prop && prop.select && prop.select.name) || "";
}

function multiSelectJoined(prop) {
  if (!prop || !Array.isArray(prop.multi_select)) return "";
  return prop.multi_select
    .map(function (s) {
      return s.name;
    })
    .join(", ");
}

function prioridadeValue(prop) {
  if (!prop) return "";
  return multiSelectJoined(prop) || (prop.select && prop.select.name) || "";
}

// "Responsável"/"Pessoa" pode ser texto, pessoa (people), select ou
// multi-seleção dependendo do condomínio.
function personValue(prop) {
  if (!prop) return "";
  if (Array.isArray(prop.people)) {
    return prop.people
      .map(function (person) {
        return person.name || "";
      })
      .join(", ");
  }
  return multiSelectJoined(prop) || (prop.select && prop.select.name) || richText(prop);
}

// "Criada em"/"Criado em" pode ser data manual ou o created_time automático
// do Notion (string direta, sem `.date.start`).
function createdValue(prop) {
  if (!prop) return null;
  if (typeof prop.created_time === "string") return prop.created_time;
  return (prop.date && prop.date.start) || null;
}
