// Testes isolados pra diagnosticar por que a criação automática de aba não
// está funcionando. Rode cada função na ordem (menu suspenso no topo do
// editor Apps Script → escolher a função → botão "Executar" ▶), depois
// confira o log em "Ver → Registros" (ou Ctrl+Enter). Cada teste imprime um
// resultado claro — me manda o que aparecer, principalmente qualquer ❌.
//
// Nenhum desses testes depende de trigger (onEdit/onFormSubmit) — rodam
// direto, então isolam se o problema é na lógica ou na configuração do
// trigger em si.

function teste1_ConfigSheetExiste() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) {
    Logger.log("❌ Não encontrei uma aba chamada '" + CONFIG_SHEET_NAME + "'.");
    Logger.log("Abas existentes: " + ss.getSheets().map(function (s) { return s.getName(); }).join(", "));
    return;
  }
  const lastRow = sheet.getLastRow();
  Logger.log("✅ Aba '" + CONFIG_SHEET_NAME + "' encontrada. Última linha com dado: " + lastRow);
  if (lastRow >= 2) {
    const dados = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    dados.forEach(function (row, i) {
      Logger.log(
        "Linha " + (i + 2) + ": Condominio=[" + row[0] + "] URL=[" + row[1] + "] Aba=[" + row[2] + "]",
      );
    });
  }
}

function teste2_ExtrairDatabaseId() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log("❌ Não há nenhuma linha de condomínio na aba de Configuração ainda.");
    return;
  }
  const dados = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  dados.forEach(function (row, i) {
    const url = String(row[1] || "").trim();
    if (!url) return;
    const id = extrairDatabaseId(url);
    if (id) {
      Logger.log("✅ Linha " + (i + 2) + ": URL válida, database ID = " + id);
    } else {
      Logger.log("❌ Linha " + (i + 2) + ": não consegui extrair um ID de database de: " + url);
    }
  });
}

function teste3_NotionTokenConfigurado() {
  const token = PropertiesService.getScriptProperties().getProperty("NOTION_API_KEY");
  if (!token) {
    Logger.log("❌ NOTION_API_KEY não está configurado em Script Properties.");
    Logger.log("Vá em Configurações do projeto (ícone de engrenagem) → Propriedades do script → adicionar NOTION_API_KEY.");
    return;
  }
  Logger.log("✅ NOTION_API_KEY configurado (tamanho: " + token.length + " caracteres).");
}

// Troque DB_ID_DE_TESTE pelo ID de uma database real (pegue do log do
// teste2). Esse teste chama o Notion de verdade e mostra o erro exato se a
// integração não tiver acesso à database.
function teste4_BuscarDemandasNotion() {
  const DB_ID_DE_TESTE = "COLE_AQUI_UM_ID_DO_TESTE_2";

  const token = PropertiesService.getScriptProperties().getProperty("NOTION_API_KEY");
  if (!token) {
    Logger.log("❌ Rode o teste3 primeiro — token não configurado.");
    return;
  }
  if (DB_ID_DE_TESTE === "COLE_AQUI_UM_ID_DO_TESTE_2") {
    Logger.log("⚠️ Edite este arquivo e cole um ID real de database na variável DB_ID_DE_TESTE antes de rodar.");
    return;
  }

  try {
    const demandas = buscarDemandas(token, DB_ID_DE_TESTE, "Teste");
    Logger.log("✅ Consegui consultar o Notion — " + demandas.length + " demanda(s) encontrada(s).");
    if (demandas.length > 0) {
      Logger.log("Exemplo da primeira: " + JSON.stringify(demandas[0]));
    }
  } catch (err) {
    Logger.log("❌ Falha ao consultar o Notion: " + err.message);
    Logger.log("Causas comuns: a database não foi compartilhada com a integração, ou o ID está errado.");
  }
}

// Roda a MESMA função que o trigger onEdit chamaria, mas manualmente — sem
// precisar editar a planilha. Se isso funcionar (criar a aba + popular
// dados) mas editar a célula na mão não disparar nada, o problema está na
// configuração do trigger (não foi criado, ou aponta pra função errada).
function teste5_ProcessarConfiguracaoManual() {
  Logger.log("Rodando processarConfiguracao() manualmente...");
  processarConfiguracao();
  Logger.log("✅ Terminou sem lançar erro. Confira se uma aba nova apareceu e se a coluna 'Aba' foi preenchida.");
}

// Lista os triggers instalados neste projeto (não dá pra ver o tipo de
// evento por aqui, só a função e o handler — use o menu "Acionadores" à
// esquerda pra ver o evento de cada um).
function teste6_ListarTriggersInstalados() {
  const triggers = ScriptApp.getProjectTriggers();
  if (triggers.length === 0) {
    Logger.log("❌ Nenhum trigger instalado neste projeto.");
    return [];
  }
  const resumo = triggers.map(function (t) {
    return { funcao: t.getHandlerFunction(), tipo: String(t.getEventType()) };
  });
  resumo.forEach(function (r) {
    Logger.log("Trigger → função: " + r.funcao + " | tipo: " + r.tipo);
  });
  return resumo;
}

// Execução única: apaga as linhas da semana 32 (fotografia bugada, gerada
// por um teste manual antes do fix de fuso horário em semanaAtual() —
// virava semana errada perto da virada do dia em UTC vs. America/Sao_Paulo)
// em TODAS as abas de histórico cadastradas na Configuração e também na
// aba "Follow-up da semana". Rode uma vez só; depois disso pode rodar
// capturarTodasFotografias de novo pra gerar a semana 31 (a correta) tanto
// no histórico quanto no follow-up.
function limparSemana32Espuria() {
  const SEMANA_A_REMOVER = 32;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  const lastRow = configSheet.getLastRow();
  if (lastRow >= 2) {
    const gids = configSheet.getRange(2, COL_ABA, lastRow - 1, 1).getValues();
    gids.forEach(function (row) {
      const gid = row[0];
      if (!gid) return;
      const sheet = getSheetByGid(ss, gid);
      if (!sheet) return;
      const removidas = removerLinhasPorSemana(sheet, 1, SEMANA_A_REMOVER); // coluna A = SemanaN
      Logger.log(sheet.getName() + ": " + removidas + " linha(s) da semana " + SEMANA_A_REMOVER + " removida(s).");
    });
  }

  const followupSheet = ss.getSheetByName(FOLLOWUP_SHEET_NAME);
  if (followupSheet) {
    const removidas = removerLinhasPorSemana(followupSheet, 2, SEMANA_A_REMOVER); // coluna B = semana
    Logger.log(FOLLOWUP_SHEET_NAME + ": " + removidas + " linha(s) da semana " + SEMANA_A_REMOVER + " removida(s).");
  }

  Logger.log("✅ Limpeza concluída.");
}

function removerLinhasPorSemana(sheet, coluna, semanaN) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, coluna, lastRow - 1, 1).getValues();
  let removidas = 0;
  for (let i = values.length - 1; i >= 0; i--) {
    if (Number(values[i][0]) === semanaN) {
      sheet.deleteRow(i + 2);
      removidas++;
    }
  }
  return removidas;
}
