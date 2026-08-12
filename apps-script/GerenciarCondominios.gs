// Cria automaticamente a aba de histórico de um condomínio assim que a
// síndica cadastra o nome + link do Notion na aba "Configuração" — seja
// editando a célula diretamente, seja via Google Form ligado a esta planilha.
// Os dois gatilhos (aoEditarConfiguracao / aoReceberFormulario) chamam a
// mesma função; a checagem "já tem Aba preenchida?" garante que a aba só é
// criada uma vez, mesmo que os dois disparem para a mesma linha.
//
// Configuração necessária no editor Apps Script (menu Triggers):
//   - aoEditarConfiguracao   → evento: From spreadsheet → On edit
//   - aoReceberFormulario    → evento: From spreadsheet → On form submit
//     (só necessário se você ligar um Google Form a esta planilha)

function aoEditarConfiguracao(e) {
  processarConfiguracao();
}

function aoReceberFormulario(e) {
  processarConfiguracao();
}

function processarConfiguracao() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return; // outra execução já está processando — evita criar aba duplicada
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
    if (!sheet) return;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const dados = sheet.getRange(2, 1, lastRow - 1, COL_ID).getValues();
    dados.forEach(function (row, i) {
      const linha = i + 2;
      const condominio = String(row[0] || "").trim();
      const url = String(row[1] || "").trim();
      const abaAtual = row[2];
      if (!condominio || !url) return;
      if (abaAtual) return; // já configurado — idempotente

      configurarCondominio(ss, sheet, linha, condominio, url);
    });
  } finally {
    lock.releaseLock();
  }
}

function configurarCondominio(ss, configSheet, linha, condominio, url) {
  const dbId = extrairDatabaseId(url);
  const celulaAba = configSheet.getRange(linha, COL_ABA);

  if (!dbId) {
    celulaAba.setNote("Link não parece ser uma database do Notion — verifique a URL.");
    return;
  }

  const nomeAba = nomeAbaAmigavel(condominio, ss);
  const aba = ss.insertSheet(nomeAba);
  aba.getRange(1, 1, 1, HEADERS_HISTORICO.length).setValues([HEADERS_HISTORICO]);
  aba.setFrozenRows(1);

  celulaAba.clearNote();
  celulaAba.setValue(aba.getSheetId());
  // Slug usado na URL do relatório (/{id}) — o app lê essa coluna em vez de
  // calcular a partir do nome, pra sempre bater exatamente com a rota.
  configSheet.getRange(linha, COL_ID).setValue(slugifyCondominio(condominio));

  capturarFotografiaInicial(ss, aba, dbId, condominio, celulaAba);
}

// Busca a primeira fotografia assim que a aba nasce, pra não deixar o
// condomínio sem nenhum dado até a próxima captura semanal (sexta-feira).
// Usa a mesma função de captura de CapturaSemanal.gs (mesmo projeto Apps
// Script, escopo global compartilhado). Se falhar (token não configurado,
// database ainda não compartilhada com a integração, etc.), a aba já criada
// fica vazia e o erro é anotado na célula — a captura semanal tenta de novo
// na sexta.
function capturarFotografiaInicial(ss, sheet, dbId, condominio, celulaAba) {
  const tokens = getNotionTokens(PropertiesService.getScriptProperties());
  if (tokens.length === 0) {
    celulaAba.setNote(
      "Aba criada, mas não consegui buscar os dados iniciais: configure NOTION_API_KEY em Script Properties.",
    );
    return;
  }
  try {
    capturarFotografiaCondominio(ss, sheet, tokens, dbId, condominio);
  } catch (err) {
    celulaAba.setNote(
      "Aba criada, mas a captura inicial falhou: " +
        err.message +
        ". A próxima captura semanal tenta de novo.",
    );
  }
}

function nomeAbaAmigavel(condominio, ss) {
  const base =
    condominio
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "") || "condominio";

  let nome = base;
  let n = 2;
  while (ss.getSheetByName(nome)) {
    nome = base + "-" + n;
    n += 1;
  }
  return nome;
}
