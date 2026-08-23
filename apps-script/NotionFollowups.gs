// Espelha a aba "Follow-up da semana" na database "Gestão em Movimento -
// Relatórios Semanais" do Notion, pra dar à síndica (e a quem mais acessa o
// Notion) a mesma tabela de links sem precisar abrir o app. Alimentada pelo
// mesmo loop semanal de CapturaSemanal.gs — ver capturarTodasFotografias().
//
// "Gestão em Movimento - Relatórios Semanais" já É uma database no Notion
// (full-page database, sem página-mãe), criada e nomeada manualmente antes
// desta automação existir — as colunas abaixo (Condominio/Semana/Intervalo
// de Semana/Link do Report) são as que já existiam e continuam sendo as
// usadas; nunca renomear ou recriar via API.
//
// Bug corrigido: esta automação estava gravando em propriedades
// Nome/Datas/URL, que não existem na database (o schema real usa
// Condominio/Intervalo de Semana/Link do Report) — toda sincronização
// falhava silenciosamente desde então (erro pego e só jogado no log de
// capturarTodasFotografias, com o prefixo "espelho Notion Relatórios
// Semanais"), e por isso a database ficou parada nas últimas 14 linhas
// (semanas 33-34, os 7 condomínios originais) sem os condomínios
// adicionados depois.
//
// Setup: a database já está com o schema certo e compartilhada com a
// integração — só rodar sincronizarTodosFollowUpsNotion() uma vez pra
// recuperar o histórico que ficou faltando; dali em diante,
// capturarTodasFotografias() (o trigger semanal) mantém tudo em dia
// sozinho.

const NOTION_FOLLOWUPS_DB_ID = "3c1e69ba114f8020b465f0db2be179ee";

// Chamado a cada condomínio, dentro do loop de capturarTodasFotografias
// (CapturaSemanal.gs) — só sincroniza a semana corrente. Monta o link e
// delega pro upsert genérico (sincronizarLinhaFollowUpComTokens), que é o
// mesmo usado pelo backfill de histórico completo (sincronizarTodosFollowUpsNotion).
function sincronizarFollowUpComTokens(tokens, dbId, condominio, id, semana) {
  const link = montarLinkFollowUp(id, semana.start, semana.end);
  sincronizarLinhaFollowUpComTokens(tokens, dbId, condominio, semana.n, semana.start, semana.end, link);
}

// Execução sob demanda — sincroniza TODO o histórico já existente na aba
// "Follow-up da semana" (todas as semanas de todos os condomínios), não só
// a semana atual. Rodar uma vez pra popular a database do zero; depois
// disso o trigger semanal (capturarTodasFotografias) mantém tudo em dia
// incrementalmente.
//
// Otimizado pra não estourar o limite de 6 minutos de execução do Apps
// Script: descobre o token válido pra essa database UMA vez (em vez de
// testar tokens errados a cada linha) e busca todas as páginas já
// existentes de uma vez só (em vez de uma query por linha).
function sincronizarTodosFollowUpsNotion() {
  const props = PropertiesService.getScriptProperties();
  const tokens = getNotionTokens(props);
  if (tokens.length === 0) {
    throw new Error("Configure NOTION_API_KEY em Script Properties.");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(FOLLOWUP_SHEET_NAME);
  if (!sheet) {
    throw new Error("Aba '" + FOLLOWUP_SHEET_NAME + "' não encontrada.");
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log("Aba '" + FOLLOWUP_SHEET_NAME + "' está vazia — nada pra sincronizar.");
    return;
  }

  const token = encontrarTokenFollowUpsNotion(tokens);
  const existentes = buscarTodasPaginasFollowUpNotion(token);

  const linhas = sheet.getRange(2, 1, lastRow - 1, HEADERS_FOLLOWUP.length).getValues();
  const erros = [];
  let ok = 0;

  linhas.forEach(function (row) {
    const condominio = String(row[0] || "").trim();
    const semanaN = Number(row[1]);
    const link = String(row[2] || "").trim();
    const dataInicio = formatIsoDeCelula(row[3]);
    const dataFim = formatIsoDeCelula(row[4]);
    if (!condominio || !semanaN || !link) return;

    const properties = montarPropriedadesFollowUp(condominio, semanaN, dataInicio, dataFim, link);
    const chave = condominio + "|||" + semanaN;

    try {
      if (existentes[chave]) {
        atualizarPaginaFollowUp(token, existentes[chave], properties);
      } else {
        const pagina = criarPaginaFollowUp(token, NOTION_FOLLOWUPS_DB_ID, properties);
        existentes[chave] = pagina.id;
      }
      ok++;
    } catch (err) {
      erros.push(condominio + " (semana " + semanaN + "): " + err.message);
    }
  });

  Logger.log("✅ " + ok + " linha(s) sincronizada(s) com o Notion.");
  if (erros.length > 0) {
    Logger.log("Falhas:\n" + erros.join("\n"));
  }
}

// Testa cada token com uma chamada leve (retrieve da database) até achar o
// que tem acesso — evita repetir esse teste a cada linha do backfill.
function encontrarTokenFollowUpsNotion(tokens) {
  const headers = function (token) {
    return { Authorization: "Bearer " + token, "Notion-Version": NOTION_VERSION };
  };
  let ultimoErro = null;
  for (let i = 0; i < tokens.length; i++) {
    const res = UrlFetchApp.fetch("https://api.notion.com/v1/databases/" + NOTION_FOLLOWUPS_DB_ID, {
      method: "get",
      headers: headers(tokens[i]),
      muteHttpExceptions: true,
    });
    const json = JSON.parse(res.getContentText());
    if (json.object !== "error") return tokens[i];
    ultimoErro = new Error("Notion API: " + (json.message || res.getContentText()));
  }
  throw ultimoErro || new Error("Nenhum token configurado.");
}

// Pagina a database inteira uma vez e monta um mapa "condominio|||semana" ->
// pageId, pra decidir criar/atualizar sem uma query por linha.
function buscarTodasPaginasFollowUpNotion(token) {
  const headers = { Authorization: "Bearer " + token, "Notion-Version": NOTION_VERSION };
  const mapa = {};
  let cursor = null;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = UrlFetchApp.fetch(
      "https://api.notion.com/v1/databases/" + NOTION_FOLLOWUPS_DB_ID + "/query",
      {
        method: "post",
        headers: headers,
        contentType: "application/json",
        payload: JSON.stringify(body),
        muteHttpExceptions: true,
      },
    );
    const json = JSON.parse(res.getContentText());
    if (json.object === "error") {
      throw new Error("Notion API: " + (json.message || res.getContentText()));
    }
    json.results.forEach(function (page) {
      const titulo = page.properties.Condominio.title;
      const nome = titulo.length > 0 ? titulo[0].plain_text : "";
      const semana = page.properties.Semana.number;
      if (nome && semana != null) {
        mapa[nome + "|||" + semana] = page.id;
      }
    });
    cursor = json.has_more ? json.next_cursor : null;
  } while (cursor);
  return mapa;
}

// A aba "Follow-up da semana" guarda data-inicio/data-termino como string
// ISO (yyyy-MM-dd), mas o Google Sheets pode converter automaticamente pra
// um Date de verdade na célula, dependendo da formatação — trata os dois
// casos.
function formatIsoDeCelula(value) {
  if (value instanceof Date) return formatIso(value);
  return String(value || "");
}

// Upsert de UMA linha (condominio + semana). Tenta cada token até um
// conseguir consultar/gravar — mesmo padrão de buscarDemandasComTokens.
function sincronizarLinhaFollowUpComTokens(tokens, dbId, condominio, semanaN, dataInicio, dataFim, link) {
  let ultimoErro = null;
  for (let i = 0; i < tokens.length; i++) {
    try {
      sincronizarLinhaFollowUpNotion(tokens[i], dbId, condominio, semanaN, dataInicio, dataFim, link);
      return;
    } catch (err) {
      ultimoErro = err;
    }
  }
  throw ultimoErro;
}

// Reescreve todas as propriedades em ambos os casos (criar/atualizar) —
// mais simples que PATCH parcial e sem risco de deixar campo desatualizado.
function sincronizarLinhaFollowUpNotion(token, dbId, condominio, semanaN, dataInicio, dataFim, link) {
  const properties = montarPropriedadesFollowUp(condominio, semanaN, dataInicio, dataFim, link);
  const existente = buscarPaginaFollowUpExistente(token, dbId, condominio, semanaN);
  if (existente) {
    atualizarPaginaFollowUp(token, existente.id, properties);
  } else {
    criarPaginaFollowUp(token, dbId, properties);
  }
}

function montarPropriedadesFollowUp(condominio, semanaN, dataInicio, dataFim, link) {
  return {
    Condominio: { title: [{ text: { content: condominio } }] },
    Semana: { number: semanaN },
    "Intervalo de Semana": { date: { start: dataInicio, end: dataFim } },
    "Link do Report": { url: link },
  };
}

// Filtra por Condominio (title) + Semana (number) — mesma chave de dedup
// usada em removerFollowUpExistente (Config.gs). Só pode haver 0 ou 1
// resultado nessa combinação; não precisa paginar.
function buscarPaginaFollowUpExistente(token, dbId, condominio, semanaN) {
  const headers = { Authorization: "Bearer " + token, "Notion-Version": NOTION_VERSION };
  const body = {
    filter: {
      and: [
        { property: "Condominio", title: { equals: condominio } },
        { property: "Semana", number: { equals: semanaN } },
      ],
    },
    page_size: 2,
  };
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
  return (json.results && json.results[0]) || null;
}

function criarPaginaFollowUp(token, dbId, properties) {
  const headers = { Authorization: "Bearer " + token, "Notion-Version": NOTION_VERSION };
  const body = { parent: { database_id: dbId }, properties: properties };
  const res = UrlFetchApp.fetch("https://api.notion.com/v1/pages", {
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
  return json;
}

function atualizarPaginaFollowUp(token, pageId, properties) {
  const headers = { Authorization: "Bearer " + token, "Notion-Version": NOTION_VERSION };
  const res = UrlFetchApp.fetch("https://api.notion.com/v1/pages/" + pageId, {
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
