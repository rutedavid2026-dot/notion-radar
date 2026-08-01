// Constantes e helpers compartilhados entre GerenciarCondominios.gs e
// CapturaSemanal.gs. Os três arquivos vivem no mesmo projeto Apps Script,
// vinculado à planilha "base-gestao-em-movimento".

const CONFIG_SHEET_NAME = "Configuração";
const COL_CONDOMINIO = 1; // A
const COL_URL = 2; // B
const COL_ABA = 3; // C — guarda o GID (numérico) da aba de histórico do condomínio

// URL de produção do relatório — usada pra montar o link da aba "Follow-up
// da semana" (routing atual: /{slug-do-condominio}?semanainicio=...&semanafim=...).
const BASE_URL = "https://notion-radar.lovable.app";

const FOLLOWUP_SHEET_NAME = "Follow-up da semana";
const HEADERS_FOLLOWUP = ["condominio", "semana", "link-follow-up", "data-inicio", "data-termino"];

const HEADERS_HISTORICO = [
  "SemanaN",
  "SemanaInicio",
  "SemanaFim",
  "CapturadoEm",
  "Condominio",
  "Demanda",
  "Responsavel",
  "Status",
  "Prioridade",
  "Area",
  "CriadaEm",
  "UltimaAtualizacao",
  "Historico",
  "DataUltimaEdicao",
  "URL",
  "PageId",
  "Ordem",
  "Previsao",
  "DataPrevista",
  "ConcluidoEm",
];

function extrairDatabaseId(url) {
  const m = String(url || "").match(
    /[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}/,
  );
  return m ? m[0].replace(/-/g, "") : null;
}

function getSheetByGid(ss, gid) {
  const alvo = Number(gid);
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === alvo) return sheets[i];
  }
  return null;
}

// Mesmo algoritmo de slugify() usado no app (src/lib/report-utils.ts) —
// duplicado de propósito, sem a lógica de desambiguação por sufixo que
// nomeAbaAmigavel() usa pra nomear abas, porque aqui o slug precisa bater
// exatamente com a rota /{slug} do app.
function slugifyCondominio(nome) {
  return (
    String(nome || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "") || ""
  );
}

// "yyyy-MM-dd" (formato de semana.start/end) -> "dd-MM-yyyy" (formato aceito
// pelos search params semanainicio/semanafim do app).
function formatDataBr(isoDate) {
  const partes = String(isoDate || "").split("-");
  return partes.length === 3 ? partes[2] + "-" + partes[1] + "-" + partes[0] : "";
}

function montarLinkFollowUp(condominio, semanaInicio, semanaFim) {
  return (
    BASE_URL +
    "/" +
    slugifyCondominio(condominio) +
    "?semanainicio=" +
    formatDataBr(semanaInicio) +
    "&semanafim=" +
    formatDataBr(semanaFim)
  );
}

function getOrCreateFollowupSheet(ss) {
  let sheet = ss.getSheetByName(FOLLOWUP_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(FOLLOWUP_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS_FOLLOWUP.length).setValues([HEADERS_FOLLOWUP]);
  }
  return sheet;
}

// Registra (ou substitui, se a captura da semana já tinha rodado antes) a
// linha de follow-up de UM condomínio numa semana específica.
function registrarFollowUpSemana(followupSheet, condominio, semana) {
  removerFollowUpExistente(followupSheet, condominio, semana.n);
  followupSheet.appendRow([
    condominio,
    semana.n,
    montarLinkFollowUp(condominio, semana.start, semana.end),
    semana.start,
    semana.end,
  ]);
}

function removerFollowUpExistente(sheet, condominio, semanaN) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues(); // A=condominio, B=semana
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]) === condominio && Number(values[i][1]) === semanaN) {
      sheet.deleteRow(i + 2);
    }
  }
}

// Execução única (rodar manualmente pelo editor Apps Script após colar esta
// versão do código): reescreve a linha de cabeçalho de cada aba de
// histórico já criada para o novo nome dos campos "Última Ação"/"Última
// Atualização" — abas criadas depois já nascem corretas via
// GerenciarCondominios.gs. Identifica cada aba pelo GID listado na coluna
// "Aba" da Configuração, então não depende do nome da aba.
function renomearCabecalhosExistentes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!configSheet) return;

  const lastRow = configSheet.getLastRow();
  if (lastRow < 2) return;

  const gids = configSheet.getRange(2, COL_ABA, lastRow - 1, 1).getValues();
  gids.forEach(function (row) {
    const gid = row[0];
    if (!gid) return;
    const sheet = getSheetByGid(ss, gid);
    if (!sheet || sheet.getLastColumn() === 0) return;
    sheet.getRange(1, 1, 1, HEADERS_HISTORICO.length).setValues([HEADERS_HISTORICO]);
  });
}
