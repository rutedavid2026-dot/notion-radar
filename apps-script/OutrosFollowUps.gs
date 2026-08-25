// "Outros Follow-ups": relatórios de acompanhamento que não são o follow-up
// semanal padrão de demandas de um condomínio — por enquanto, só o Plano de
// Ação da Vivendas (derivado de um laudo de vistoria, schema bem diferente
// das databases de demandas normais). Roda dentro do mesmo trigger semanal
// de CapturaSemanal.gs (capturarTodasFotografias), grava um snapshot da
// semana numa aba de histórico própria, e registra o link na aba "Outros
// Follow-ups" (separada de "Follow-up da semana", que é só pros
// condomínios cadastrados na aba "Configuração").

const PLANO_ACAO_VIVENDAS_DB_ID = "3c2e69ba114f80cb9c62f1a0843dcf73";
const PLANO_ACAO_VIVENDAS_SHEET_NAME = "Vivendas - Plano de Ação";
const PLANO_ACAO_VIVENDAS_ID = "vivendas-plano-de-acao"; // slug usado na URL do relatório
const PLANO_ACAO_VIVENDAS_NOME = "Vivendas - Plano de Ação"; // rótulo na tabela de links

const OUTROS_FOLLOWUPS_SHEET_NAME = "Outros Follow-ups";
const HEADERS_OUTROS_FOLLOWUP = ["nome", "semana", "link-follow-up", "data-inicio", "data-termino"];

const HEADERS_PLANO_ACAO = [
  "SemanaN",
  "SemanaInicio",
  "SemanaFim",
  "CapturadoEm",
  "Acao",
  "Status",
  "Prioridade",
  "Categoria",
  "Area",
  "ResponsavelSugerido",
  "PrazoPrimeiraProvidencia",
  "PrazoConclusao",
  "AcaoRecomendada",
  "Risco",
  "Origem",
  "ReferenciaRelatorio",
  "TipoDeAcao",
  "ApontamentoOriginal",
  "GarantiaFastBuilt",
  "Paginas",
  "PageId",
  "URL",
  "DataUltimaEdicao",
];

// Chamada dentro do loop de capturarTodasFotografias (CapturaSemanal.gs),
// numa tentativa própria — uma falha aqui não deve derrubar a captura dos
// condomínios normais.
function capturarOutrosFollowUps(ss, tokens) {
  capturarPlanoDeAcaoVivendas(ss, tokens);
}

// Execução isolada, só dessa peça — mais rápido pra testar do que rodar
// capturarTodasFotografias() inteira (que bate na API de todos os 7+
// condomínios também). Cria as abas na primeira vez e loga o GID de cada
// uma, necessário pra configurar a leitura no app depois.
function testeCapturarOutrosFollowUps() {
  const props = PropertiesService.getScriptProperties();
  const tokens = getNotionTokens(props);
  if (tokens.length === 0) {
    throw new Error("Configure NOTION_API_KEY em Script Properties.");
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  capturarOutrosFollowUps(ss, tokens);
  Logger.log("✅ Captura de 'Outros Follow-ups' concluída.");
}

function capturarPlanoDeAcaoVivendas(ss, tokens) {
  const sheet = getOrCreateSheetComHeaders(ss, PLANO_ACAO_VIVENDAS_SHEET_NAME, HEADERS_PLANO_ACAO);
  Logger.log("Aba '" + PLANO_ACAO_VIVENDAS_SHEET_NAME + "' — GID: " + sheet.getSheetId());

  const semana = semanaAtual();
  const capturadoEm = new Date();
  const paginas = buscarTodasPaginasComTokens(tokens, PLANO_ACAO_VIVENDAS_DB_ID);

  removerSemanaExistente(sheet, semana.start);

  const rows = paginas.map(function (page) {
    const d = mapPagePlanoDeAcao(page);
    return [
      semana.n,
      semana.start,
      semana.end,
      capturadoEm,
      d.acao,
      d.status,
      d.prioridade,
      d.categoria,
      d.area,
      d.responsavelSugerido,
      d.prazoPrimeiraProvidencia,
      d.prazoConclusao,
      d.acaoRecomendada,
      d.risco,
      d.origem,
      d.referenciaRelatorio,
      d.tipoDeAcao,
      d.apontamentoOriginal,
      d.garantiaFastBuilt,
      d.paginas,
      d.id,
      d.url,
      d.dataUltimaEdicao,
    ];
  });

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  const outrosSheet = getOrCreateSheetComHeaders(ss, OUTROS_FOLLOWUPS_SHEET_NAME, HEADERS_OUTROS_FOLLOWUP);
  Logger.log("Aba '" + OUTROS_FOLLOWUPS_SHEET_NAME + "' — GID: " + outrosSheet.getSheetId());
  registrarOutroFollowUp(outrosSheet, PLANO_ACAO_VIVENDAS_NOME, PLANO_ACAO_VIVENDAS_ID, semana);
}

function mapPagePlanoDeAcao(page) {
  const p = page.properties || {};
  return {
    acao: richText(p["Ação"]),
    status: statusValue(p["Status"]) || "",
    prioridade: prioridadeValue(p["Prioridade"]) || "",
    categoria: multiSelectJoined(p["Categoria"]),
    area: multiSelectJoined(p["Área"]),
    responsavelSugerido: multiSelectJoined(p["Responsável sugerido"]),
    prazoPrimeiraProvidencia: dateValue(p["Prazo - primeira providência"]) || "",
    prazoConclusao: dateValue(p["Prazo - conclusão"]) || "",
    acaoRecomendada: richText(p["Ação recomendada"]),
    risco: richText(p["Risco"]),
    origem: selectName(p["Origem"]),
    referenciaRelatorio: richText(p["Referência no relatório"]),
    tipoDeAcao: selectName(p["Tipo de ação"]),
    apontamentoOriginal: richText(p["Apontamento original"]),
    garantiaFastBuilt: urlValue(p["Garantia / FastBuilt"]),
    paginas: richText(p["Página(s)"]),
    id: page.id,
    url: page.url,
    dataUltimaEdicao: page.last_edited_time,
  };
}

function urlValue(prop) {
  return (prop && prop.url) || "";
}

function getOrCreateSheetComHeaders(ss, nome, headers) {
  let sheet = ss.getSheetByName(nome);
  if (!sheet) {
    sheet = ss.insertSheet(nome);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

// Registra (ou substitui, se já tinha rodado essa semana) a linha de
// follow-up de UM item na aba "Outros Follow-ups" — mesmo padrão de
// registrarFollowUpSemana (Config.gs), só que numa aba separada e sem
// depender da aba "Configuração".
function registrarOutroFollowUp(sheet, nome, id, semana) {
  removerOutroFollowUpExistente(sheet, nome, semana.n);
  sheet.appendRow([nome, semana.n, montarLinkFollowUp(id, semana.start, semana.end), semana.start, semana.end]);
}

function removerOutroFollowUpExistente(sheet, nome, semanaN) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]) === nome && Number(values[i][1]) === semanaN) {
      sheet.deleteRow(i + 2);
    }
  }
}

function buscarTodasPaginasComTokens(tokens, dbId) {
  let ultimoErro = null;
  for (let i = 0; i < tokens.length; i++) {
    try {
      return buscarTodasPaginas(tokens[i], dbId);
    } catch (err) {
      ultimoErro = err;
      if (isErroCotaUrlFetch(err)) break; // cota é da conta inteira — outros tokens não vão ajudar
    }
  }
  throw ultimoErro;
}

// Diagnóstico (só leitura) usado antes pra entender o schema da database —
// mantido pra referência futura, não roda automaticamente.
function teste9_DiagnosticoOutrosFollowUps() {
  const props = PropertiesService.getScriptProperties();
  const tokens = getNotionTokens(props);
  if (tokens.length === 0) {
    Logger.log("❌ Configure NOTION_API_KEY em Script Properties.");
    return;
  }

  let ultimoErro = null;
  for (let i = 0; i < tokens.length; i++) {
    try {
      const db = buscarSchemaDatabase(tokens[i], PLANO_ACAO_VIVENDAS_DB_ID);
      Logger.log("Título: " + (db.title && db.title[0] && db.title[0].plain_text));
      Logger.log("ID: " + db.id);
      const nomes = Object.keys(db.properties);
      Logger.log("Total de propriedades: " + nomes.length);
      nomes.forEach(function (nome) {
        const prop = db.properties[nome];
        let linha = "- " + nome + " (" + prop.type + ")";
        if (prop.type === "formula" && prop.formula && prop.formula.expression) {
          linha += "\n    fórmula: " + prop.formula.expression;
        }
        Logger.log(linha);
      });
      return;
    } catch (err) {
      ultimoErro = err;
    }
  }
  Logger.log("❌ " + ultimoErro.message);
}
