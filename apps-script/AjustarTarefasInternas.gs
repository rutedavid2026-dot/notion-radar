// Adiciona à database "Base de Dados - Tarefas Internas" as colunas de
// prazo usadas nas databases por condomínio (ex.: Jazz Club) — Data de
// Início, Previsão (em dias), e as fórmulas Data Prevista de Conclusão e
// Situação do Prazo, com a mesma expressão exata do Jazz Club. Só adiciona
// colunas novas, não mexe nas colunas já existentes (RESPONSÁVEL, Status
// da Tarefa etc. ficam como estão).
//
// Setup: rodar uma vez, manualmente, pelo editor Apps Script.

const TAREFAS_INTERNAS_DB_ID = "3c1e69ba114f80439e71f68e816f046a";

function configurarFormulasPrazoTarefasInternas() {
  const props = PropertiesService.getScriptProperties();
  const tokens = getNotionTokens(props);
  if (tokens.length === 0) {
    throw new Error("Configure NOTION_API_KEY em Script Properties.");
  }

  let ultimoErro = null;
  for (let i = 0; i < tokens.length; i++) {
    try {
      adicionarFormulasPrazo(tokens[i]);
      Logger.log(
        "✅ Colunas 'Data de Início', 'Previsão (em dias)', 'Data Prevista de Conclusão' e " +
          "'Situação do Prazo' configuradas em " +
          TAREFAS_INTERNAS_DB_ID +
          ".",
      );
      return;
    } catch (err) {
      ultimoErro = err;
    }
  }
  throw ultimoErro;
}

function adicionarFormulasPrazo(token) {
  const headers = { Authorization: "Bearer " + token, "Notion-Version": NOTION_VERSION };
  const body = {
    properties: {
      "Data de Início": { date: {} },
      "Previsão (em dias)": { number: {} },
      "Data Prevista de Conclusão": {
        formula: {
          expression:
            'formatDate(dateAdd(prop("Data de Início"), prop("Previsão (em dias)"), "days"), "DD/MM/YYYY")',
        },
      },
      "Situação do Prazo": {
        formula: {
          expression:
            'if(empty(prop("Data de Conclusão")), if(formatDate(dateAdd(prop("Data de Início"), prop("Previsão (em dias)"), "days"), "YYYY-MM-DD") >= formatDate(now(), "YYYY-MM-DD"), "Em dia", "Atrasada"), if(formatDate(prop("Data de Conclusão"), "YYYY-MM-DD") > formatDate(dateAdd(prop("Data de Início"), prop("Previsão (em dias)"), "days"), "YYYY-MM-DD"), "Concluída com Atraso", "Concluída no Prazo"))',
        },
      },
    },
  };
  const res = UrlFetchApp.fetch("https://api.notion.com/v1/databases/" + TAREFAS_INTERNAS_DB_ID, {
    method: "patch",
    headers: headers,
    contentType: "application/json",
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  const json = JSON.parse(res.getContentText());
  if (json.object === "error") {
    throw new Error("Notion API: " + (json.message || res.getContentText()));
  }
  return json;
}

// Diagnóstico (só leitura, não grava nada) pra antes de copiar "Data de
// Conclusão" de uma database de origem pra "Tarefas Internas": confirma se
// o tipo da coluna no alvo já é "date" (editável) e mostra o schema da
// origem, pra decidir com segurança como casar "a tarefa correspondente"
// entre as duas (só por título? tem uma coluna de condomínio na origem
// também, pra evitar casar tarefas de nomes iguais em condomínios
// diferentes?).
const DATA_CONCLUSAO_ORIGEM_DB_ID = "2b1e69ba114f8235b700812515cb5c63";

function teste8_DiagnosticoCopiaDataConclusao() {
  const props = PropertiesService.getScriptProperties();
  const tokens = getNotionTokens(props);
  if (tokens.length === 0) {
    Logger.log("❌ Configure NOTION_API_KEY em Script Properties.");
    return;
  }

  let ultimoErro = null;
  for (let i = 0; i < tokens.length; i++) {
    try {
      const alvoDb = buscarSchemaDatabase(tokens[i], TAREFAS_INTERNAS_DB_ID);
      const dataConclusaoAlvo = alvoDb.properties["Data de Conclusão"];
      Logger.log(
        "ALVO — 'Data de Conclusão' é do tipo: " +
          (dataConclusaoAlvo ? dataConclusaoAlvo.type : "(não existe)"),
      );

      Logger.log("");
      Logger.log("========== SCHEMA DA ORIGEM ==========");
      const origemDb = buscarSchemaDatabase(tokens[i], DATA_CONCLUSAO_ORIGEM_DB_ID);
      Logger.log("Título: " + (origemDb.title && origemDb.title[0] && origemDb.title[0].plain_text));
      Object.keys(origemDb.properties).forEach(function (nome) {
        Logger.log("- " + nome + " (" + origemDb.properties[nome].type + ")");
      });

      Logger.log("");
      const paginasOrigem = buscarTodasPaginas(tokens[i], DATA_CONCLUSAO_ORIGEM_DB_ID);
      const paginasAlvo = buscarTodasPaginas(tokens[i], TAREFAS_INTERNAS_DB_ID);
      Logger.log("Total de páginas na origem: " + paginasOrigem.length);
      Logger.log("Total de páginas no alvo: " + paginasAlvo.length);

      // Amostra dos 5 primeiros títulos de cada lado, pra eu ver o formato
      // real (e se dá pra bater por título sozinho ou se preciso de mais
      // alguma coluna como critério).
      const tituloOrigem = acharPropriedadeTitulo(origemDb);
      const tituloAlvo = acharPropriedadeTitulo(alvoDb);
      Logger.log("Amostra ORIGEM (título='" + tituloOrigem + "'):");
      paginasOrigem.slice(0, 5).forEach(function (p) {
        Logger.log("  '" + tituloPlano(p.properties[tituloOrigem]) + "'");
      });
      Logger.log("Amostra ALVO (título='" + tituloAlvo + "'):");
      paginasAlvo.slice(0, 5).forEach(function (p) {
        Logger.log("  '" + tituloPlano(p.properties[tituloAlvo]) + "'");
      });
      return;
    } catch (err) {
      ultimoErro = err;
    }
  }
  Logger.log("❌ " + ultimoErro.message);
}

function acharPropriedadeTitulo(db) {
  const nomes = Object.keys(db.properties);
  for (let i = 0; i < nomes.length; i++) {
    if (db.properties[nomes[i]].type === "title") return nomes[i];
  }
  return null;
}

function tituloPlano(prop) {
  if (!prop || !Array.isArray(prop.title)) return "";
  return prop.title
    .map(function (t) {
      return t.plain_text || "";
    })
    .join("")
    .trim();
}

function buscarTodasPaginas(token, dbId) {
  const headers = { Authorization: "Bearer " + token, "Notion-Version": NOTION_VERSION };
  const results = [];
  let cursor = null;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = UrlFetchApp.fetch("https://api.notion.com/v1/databases/" + dbId + "/query", {
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
    results.push.apply(results, json.results || []);
    cursor = json.has_more ? json.next_cursor : null;
  } while (cursor);
  return results;
}

// Em vez de usar o texto fixo das fórmulas (função acima), busca o schema
// de uma database de referência de verdade e copia exatamente o que ela
// tem — inclusive corrige "Data de Conclusão" pro mesmo tipo que a
// referência usa (normalmente "date" editável; no ALVO hoje é o campo
// automático "Última edição da página" do Notion, que não serve pra
// fórmula de prazo, já que muda a qualquer edição, não só quando a tarefa
// é concluída).
const TAREFAS_INTERNAS_REFERENCIA_DB_ID = "3bae69ba114f804b8f22e2ce314226c8";

function sincronizarFormulasComReferencia() {
  const props = PropertiesService.getScriptProperties();
  const tokens = getNotionTokens(props);
  if (tokens.length === 0) {
    throw new Error("Configure NOTION_API_KEY em Script Properties.");
  }

  let ultimoErro = null;
  for (let i = 0; i < tokens.length; i++) {
    try {
      const referencia = buscarSchemaDatabase(tokens[i], TAREFAS_INTERNAS_REFERENCIA_DB_ID);
      logPropriedadesRelevantesReferencia(referencia);
      aplicarFormulasNaTarefasInternas(tokens[i], referencia);
      Logger.log("✅ 'Tarefas Internas' ajustada nos moldes da database de referência.");
      return;
    } catch (err) {
      ultimoErro = err;
    }
  }
  throw ultimoErro;
}

function logPropriedadesRelevantesReferencia(db) {
  [
    "Data de Início",
    "Previsão (em dias)",
    "Data de Conclusão",
    "Data Prevista de Conclusão",
    "Situação do Prazo",
  ].forEach(function (nome) {
    const prop = db.properties[nome];
    if (!prop) {
      Logger.log("⚠️ Referência não tem propriedade '" + nome + "'.");
      return;
    }
    let linha = "Referência — " + nome + " (" + prop.type + ")";
    if (prop.type === "formula") linha += ": " + prop.formula.expression;
    Logger.log(linha);
  });
}

function aplicarFormulasNaTarefasInternas(token, referencia) {
  const dataConclusaoRef = referencia.properties["Data de Conclusão"];
  const dataPrevistaRef = referencia.properties["Data Prevista de Conclusão"];
  const situacaoRef = referencia.properties["Situação do Prazo"];
  if (!dataPrevistaRef || !situacaoRef) {
    throw new Error("Database de referência não tem as colunas de fórmula esperadas.");
  }

  const properties = {
    "Data de Início": { date: {} },
    "Previsão (em dias)": { number: {} },
    "Data Prevista de Conclusão": { formula: { expression: dataPrevistaRef.formula.expression } },
    "Situação do Prazo": { formula: { expression: situacaoRef.formula.expression } },
  };
  if (dataConclusaoRef && dataConclusaoRef.type === "date") {
    properties["Data de Conclusão"] = { date: {} };
  }

  const headers = { Authorization: "Bearer " + token, "Notion-Version": NOTION_VERSION };
  const res = UrlFetchApp.fetch("https://api.notion.com/v1/databases/" + TAREFAS_INTERNAS_DB_ID, {
    method: "patch",
    headers: headers,
    contentType: "application/json",
    payload: JSON.stringify({ properties: properties }),
    muteHttpExceptions: true,
  });
  const json = JSON.parse(res.getContentText());
  if (json.object === "error") {
    throw new Error("Notion API: " + (json.message || res.getContentText()));
  }
  return json;
}
