// Constantes e helpers compartilhados entre GerenciarCondominios.gs e
// CapturaSemanal.gs. Os três arquivos vivem no mesmo projeto Apps Script,
// vinculado à planilha "base-gestao-em-movimento".

const CONFIG_SHEET_NAME = "_configuracao";
const COL_CONDOMINIO = 1; // A
const COL_URL = 2; // B
const COL_ABA = 3; // C — guarda o GID (numérico) da aba de histórico do condomínio
const COL_ID = 4; // D — slug usado na URL do relatório (ex.: "miragio-cacupe")

// URL de produção do relatório — usada pra montar o link da aba "Follow-up
// da semana" (routing atual: /{slug-do-condominio}?semanainicio=...&semanafim=...).
const BASE_URL = "https://equipesindicas.lovable.app";

const FOLLOWUP_SHEET_NAME = "Follow-up da semana";
const HEADERS_FOLLOWUP = ["condominio", "semana", "link-follow-up", "data-inicio", "data-termino"];

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

function montarLinkFollowUp(id, semanaInicio, semanaFim) {
  return (
    BASE_URL +
    "/" +
    id +
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
function registrarFollowUpSemana(followupSheet, condominio, id, semana) {
  removerFollowUpExistente(followupSheet, condominio, semana.n);
  followupSheet.appendRow([
    condominio,
    semana.n,
    montarLinkFollowUp(id, semana.start, semana.end),
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

// Execução única (rodar manualmente pelo editor Apps Script após colar esta
// versão do código): garante que a coluna "id" (D) existe na aba
// "Configuração" e preenche o slug de cada condomínio já cadastrado que
// ainda não tem id — necessário porque o app agora usa essa coluna como
// identificador da URL (/{id}) em vez de calcular o slug a partir do nome
// toda vez (nome com acento/espaço virando "Miragio+Cacupé" na URL antiga
// dava erro). Linhas criadas depois disso já ganham o id automaticamente
// via configurarCondominio() (GerenciarCondominios.gs).
function configurarColunaId() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!configSheet) return;

  const headerCell = configSheet.getRange(1, COL_ID);
  if (String(headerCell.getValue() || "").trim() === "") {
    headerCell.setValue("id");
  }

  const lastRow = configSheet.getLastRow();
  if (lastRow < 2) return;

  const dados = configSheet.getRange(2, 1, lastRow - 1, COL_ID).getValues();
  dados.forEach(function (row, i) {
    const linha = i + 2;
    const condominio = String(row[0] || "").trim();
    const idAtual = String(row[COL_ID - 1] || "").trim();
    if (!condominio || idAtual) return;
    configSheet.getRange(linha, COL_ID).setValue(slugifyCondominio(condominio));
  });

  Logger.log("✅ Coluna 'id' configurada e preenchida pros condomínios existentes.");
}

// Execução manual (rodar pelo editor Apps Script sempre que quiser
// reordenar): coloca as abas de histórico de cada condomínio em ordem
// alfabética (ignorando acentos/caixa), da esquerda pra direita. As demais
// abas (ex.: "_configuracao", "Follow-up da semana", "Outros Follow-ups",
// "Vivendas - Plano de Ação") mantêm a ordem relativa que já tinham entre
// si, mas são agrupadas no início — senão, como algumas delas nascem no
// meio da fila de condomínios (criadas depois, via insertSheet), mover só
// as abas de condomínio intercala tudo em vez de agrupar.
function organizarAbasCondominiosAlfabeticamente() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!configSheet) return;

  const lastRow = configSheet.getLastRow();
  if (lastRow < 2) return;

  const dados = configSheet.getRange(2, 1, lastRow - 1, COL_ABA).getValues();
  const condominios = dados
    .map(function (row) {
      const nome = String(row[COL_CONDOMINIO - 1] || "").trim();
      const gid = row[COL_ABA - 1];
      if (!nome || !gid) return null;
      const sheet = getSheetByGid(ss, gid);
      if (!sheet) return null;
      return { nome: nome, sheet: sheet };
    })
    .filter(Boolean);

  condominios.sort(function (a, b) {
    return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
  });

  const nomesCondominio = condominios.map(function (c) {
    return c.sheet.getName();
  });
  const abasFixas = ss.getSheets().filter(function (s) {
    return nomesCondominio.indexOf(s.getName()) === -1;
  });

  const ordemFinal = abasFixas.concat(
    condominios.map(function (c) {
      return c.sheet;
    }),
  );

  ordemFinal.forEach(function (sheet, i) {
    sheet.activate();
    ss.moveActiveSheet(i + 1);
  });

  Logger.log(
    "✅ " + condominios.length + " abas de condomínio reordenadas em ordem alfabética.",
  );
}
