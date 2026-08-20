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

// Integrações do Notion são presas a um único workspace — não existe
// "compartilhar entre workspaces". Como condomínios podem viver em
// workspaces diferentes (ex.: um condomínio novo cadastrado num workspace
// separado do resto da carteira), suportamos até 3 tokens via Script
// Properties numeradas e tentamos cada um até um conseguir ler a database.
function getNotionTokens(props) {
  return ["NOTION_API_KEY", "NOTION_API_KEY_2", "NOTION_API_KEY_3"]
    .map(function (key) {
      return props.getProperty(key);
    })
    .filter(function (t) {
      return !!t;
    });
}

function capturarTodasFotografias() {
  const props = PropertiesService.getScriptProperties();
  const tokens = getNotionTokens(props);
  if (tokens.length === 0) {
    throw new Error("Configure NOTION_API_KEY em Script Properties.");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!configSheet) {
    throw new Error("Aba '" + CONFIG_SHEET_NAME + "' não encontrada.");
  }

  const lastRow = configSheet.getLastRow();
  if (lastRow < 2) return;

  const linhas = configSheet.getRange(2, 1, lastRow - 1, COL_ID).getValues();
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

    // Usa o id já salvo na Configuração (coluna D); linhas antigas sem essa
    // coluna preenchida ainda caem no slug calculado, até rodar
    // configurarColunaId() (Config.gs).
    const id = String(row[COL_ID - 1] || "").trim() || slugifyCondominio(condominio);

    try {
      capturarFotografiaCondominio(ss, sheet, tokens, dbId, condominio);
      registrarFollowUpSemana(followupSheet, condominio, id, semana);
    } catch (err) {
      erros.push(condominio + ": " + err.message);
      return;
    }

    try {
      sincronizarFollowUpComTokens(tokens, NOTION_FOLLOWUPS_DB_ID, condominio, id, semana);
    } catch (err) {
      erros.push(condominio + " (espelho Notion Relatórios Semanais): " + err.message);
    }
  });

  try {
    capturarOutrosFollowUps(ss, tokens);
  } catch (err) {
    erros.push("Outros Follow-ups: " + err.message);
  }

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
function capturarFotografiaCondominio(ss, sheet, tokens, dbId, condominio) {
  const semana = semanaAtual();
  const capturadoEm = new Date();
  const demandas = buscarDemandasComTokens(tokens, dbId, condominio);
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
    ];
  });
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

// Calcula a semana em curso a partir da data de HOJE no fuso
// America/Sao_Paulo (não do instante UTC bruto) — Date.now()/new Date() só
// enxergam o epoch UTC, então perto da virada do dia (21h-0h em São Paulo,
// já é madrugada seguinte em UTC) a conta antiga pulava pra semana errada
// antes da hora. Normaliza "hoje" pra uma data local antes de fazer a
// aritmética de dias.
function semanaAtual() {
  const hojeLocal = Utilities.formatDate(new Date(), "America/Sao_Paulo", "yyyy-MM-dd");
  const hoje = new Date(hojeLocal + "T00:00:00Z");
  const anchor = new Date(WEEK_ANCHOR + "T00:00:00Z");
  const diffDays = Math.floor((hoje.getTime() - anchor.getTime()) / 86400000);
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

// Tenta cada token até um conseguir ler a database inteira (todas as
// páginas). O erro "object_not_found" do Notion é o mesmo tanto pra ID
// errado quanto pra database de um workspace que aquele token não alcança —
// não dá pra distinguir os dois casos, então tentamos todos os disponíveis.
function buscarDemandasComTokens(tokens, databaseId, condominioOverride) {
  let ultimoErro = null;
  for (let i = 0; i < tokens.length; i++) {
    try {
      return buscarDemandas(tokens[i], databaseId, condominioOverride);
    } catch (err) {
      ultimoErro = err;
    }
  }
  throw ultimoErro;
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
    // "Previsão"/"Previsão (em dias)" pode ser data (bases antigas) ou
    // número de dias (bases novas, ex.: Miragio Cacupé/Jazz Club) — usa ??
    // (não ||) pra não tratar 0 dias como "ausente".
    previsao:
      numberValue(p["Previsão (em dias)"]) ?? numberValue(p["Previsão"]) ?? dateValue(p["Previsão"]) ?? "",
    dataPrevista:
      dateValue(p["Data Prevista"]) ||
      formulaValue(p["Data Prevista"]) ||
      formulaValue(p["Data Prevista de Conclusão"]) ||
      "",
    concluidoEm:
      dateValue(p["Concluído em"]) ||
      dateValue(p["Data de conclusão"]) ||
      dateValue(p["Data de Conclusão"]) ||
      "",
    // "Situação do Prazo" é fórmula (tipo string) no Notion — calcula
    // Em dia/Atrasada/Concluída no Prazo/Concluída com Atraso a partir de
    // Data Prevista de Conclusão, hoje e Data de Conclusão.
    situacaoPrazo: formulaValue(p["Situação do Prazo"]) || richText(p["Situação do Prazo"]) || "",
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

function numberValue(prop) {
  return prop && typeof prop.number === "number" ? prop.number : null;
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

// Fallback pra bases (ex.: Jazz Club) que não têm "Criada em"/"Criado em" —
// usa a propriedade "Início" como data de criação.
function dateValue(prop) {
  return (prop && prop.date && prop.date.start) || null;
}

// Campos "Data Prevista"/"Data Prevista de Conclusão" viraram fórmula em
// algumas bases (ex.: Miragio Cacupé) — o resultado pode ser data
// (formula.date) ou texto já formatado (formula.string, ex.: "10/05/2026").
function formulaValue(prop) {
  const f = prop && prop.formula;
  if (!f) return null;
  if (f.type === "date") return (f.date && f.date.start) || null;
  if (f.type === "string") return f.string || null;
  return null;
}
