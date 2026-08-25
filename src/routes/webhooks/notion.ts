import { createFileRoute } from "@tanstack/react-router";

// Recebe eventos do webhook de integração do Notion (qualquer mudança em
// qualquer database/página compartilhada com a integração "relatorio-semanal"
// / NOTION_API_KEY_2 — hoje cobre todos os 29 condomínios, ver memória do
// projeto). Ao chegar um evento real, dispara o workflow do GitHub Actions
// que já faz a captura completa (scripts/capturar-historico-sheets.mjs),
// pra não duplicar a lógica de sincronização aqui.
//
// Por que grava estado na planilha em vez de guardar em memória: rodando em
// edge/serverless (Cloudflare via Nitro), cada requisição pode cair numa
// instância/isolate diferente — confirmado na prática em 2026-08-24, o GET
// logo depois do POST de verificação não via o token guardado em memória.
// A célula '_configuracao'!F1 (token de verificação) e F2 (timestamp do
// último disparo, pro debounce) viram a fonte de verdade, com o mesmo
// Service Account já usado por scripts/capturar-historico-sheets.mjs.
//
// Setup (ver instruções passadas no chat):
//   1. notion.so/my-integrations -> sua integração -> aba "Webhooks" ->
//      "+ Create a subscription" -> URL: https://SEU_DOMINIO/webhooks/notion
//   2. A Notion manda um POST único com { verification_token }. Esta rota
//      grava esse token na planilha — acesse a mesma URL via GET (a qualquer
//      momento depois, sem pressa) pra ver o token e colar de volta na UI da
//      Notion, no botão "Verify".
//   3. Depois de verificado, a Notion te dá um "signing_secret" — configure
//      como variável de ambiente NOTION_WEBHOOK_SECRET pra habilitar a
//      validação de assinatura (sem ela, a rota aceita eventos sem checar
//      origem — funciona, mas fica aberta a chamadas forjadas).
//   4. Configure também GOOGLE_SERVICE_ACCOUNT_KEY (o mesmo JSON da Service
//      Account usado no GitHub Actions), GH_WORKFLOW_TOKEN (Personal Access
//      Token do GitHub com permissão "Actions: Read and write") e,
//      opcionalmente, GH_REPO (formato "dono/repo"; default já aponta pro
//      repo atual).

const GH_REPO_DEFAULT = "rutedavid2026-dot/notion-radar";
const GH_WORKFLOW_FILE = "capturar-historico-sheets.yml";
const SPREADSHEET_ID_DEFAULT = "1fEkPgTf6oGYknWEP6zzi8eyBTpoDDQR0goJg1D_Wed0";
const CELULA_VERIFICATION_TOKEN = "'_configuracao'!F1";
const CELULA_ULTIMO_DISPARO = "'_configuracao'!F2";

// Síndica editando várias linhas em sequência dispara um evento por edição —
// sem debounce, cada uma dispara uma captura completa (29 condomínios) em
// paralelo, arriscando estourar a cota de escrita do Sheets API de novo (ver
// histórico do projeto, 2026-08-24). Só permite 1 disparo a cada 2 minutos;
// eventos dentro da janela são ignorados (a próxima captura já pega a
// mudança).
const JANELA_DEBOUNCE_MS = 2 * 60 * 1000;

// ---------- Google Sheets API (Service Account, Web Crypto — precisa rodar
// em edge runtime, por isso RSASSA-PKCS1-v1_5 via crypto.subtle em vez de
// node:crypto, diferente de scripts/capturar-historico-sheets.mjs) ----------

function base64UrlFromBytes(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  arr.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemParaArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function assinarJwt(serviceAccount: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const naoAssinado = `${base64UrlFromBytes(new TextEncoder().encode(JSON.stringify(header)))}.${base64UrlFromBytes(new TextEncoder().encode(JSON.stringify(claim)))}`;
  const chave = await crypto.subtle.importKey(
    "pkcs8",
    pemParaArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", chave, new TextEncoder().encode(naoAssinado));
  return `${naoAssinado}.${base64UrlFromBytes(assinatura)}`;
}

async function getAccessToken(serviceAccount: { client_email: string; private_key: string }): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: await assinarJwt(serviceAccount),
    }),
  });
  const json = (await res.json()) as { access_token?: string; error?: string };
  if (!json.access_token) throw new Error("Falha ao obter access token do Google: " + JSON.stringify(json));
  return json.access_token;
}

function getServiceAccount(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  return JSON.parse(raw);
}

async function lerCelula(token: string, spreadsheetId: string, celula: string): Promise<string | null> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(celula)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const json = (await res.json()) as { values?: string[][] };
  return json.values?.[0]?.[0] ?? null;
}

async function escreverCelula(token: string, spreadsheetId: string, celula: string, valor: string): Promise<void> {
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(celula)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [[valor]] }),
    },
  );
}

// ---------- Assinatura do Notion (HMAC-SHA256, header x-notion-signature) ----------

async function verificarAssinatura(rawBody: string, assinaturaRecebida: string | null, segredo: string) {
  if (!assinaturaRecebida) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const esperada = `sha256=${hex}`;
  if (esperada.length !== assinaturaRecebida.length) return false;
  // Comparação em tempo constante (evita timing attack) — XOR byte a byte.
  let diff = 0;
  for (let i = 0; i < esperada.length; i++) {
    diff |= esperada.charCodeAt(i) ^ assinaturaRecebida.charCodeAt(i);
  }
  return diff === 0;
}

async function dispararCaptura(spreadsheetId: string, sheetsToken: string | null): Promise<{ disparado: boolean; motivo: string }> {
  if (sheetsToken) {
    const ultimoDisparoRaw = await lerCelula(sheetsToken, spreadsheetId, CELULA_ULTIMO_DISPARO);
    const ultimoDisparoEm = ultimoDisparoRaw ? Number(ultimoDisparoRaw) : 0;
    if (Date.now() - ultimoDisparoEm < JANELA_DEBOUNCE_MS) {
      return { disparado: false, motivo: "debounce (evento recente, próxima captura já cobre)" };
    }
  }

  const token = process.env.GH_WORKFLOW_TOKEN;
  if (!token) {
    return { disparado: false, motivo: "GH_WORKFLOW_TOKEN não configurado" };
  }
  const repo = process.env.GH_REPO || GH_REPO_DEFAULT;
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${GH_WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  );
  if (!res.ok) {
    const detail = await res.text();
    return { disparado: false, motivo: `GitHub API: ${res.status} ${detail}` };
  }
  if (sheetsToken) {
    await escreverCelula(sheetsToken, spreadsheetId, CELULA_ULTIMO_DISPARO, String(Date.now()));
  }
  return { disparado: true, motivo: "workflow_dispatch enviado" };
}

export const Route = createFileRoute("/webhooks/notion")({
  server: {
    handlers: {
      GET: async () => {
        const serviceAccount = getServiceAccount();
        if (!serviceAccount) {
          return new Response("GOOGLE_SERVICE_ACCOUNT_KEY não configurado nesta implantação.", { status: 500 });
        }
        const spreadsheetId = process.env.REGISTRY_SPREADSHEET_ID || SPREADSHEET_ID_DEFAULT;
        const sheetsToken = await getAccessToken(serviceAccount);
        const valor = await lerCelula(sheetsToken, spreadsheetId, CELULA_VERIFICATION_TOKEN);
        return new Response(
          valor
            ? `verification_token: ${valor}`
            : "Nenhum verification_token registrado ainda (cria uma assinatura na Notion e confira aqui de novo).",
          { headers: { "Content-Type": "text/plain; charset=utf-8" } },
        );
      },
      POST: async ({ request }) => {
        const rawBody = await request.text();
        let json: Record<string, unknown>;
        try {
          json = JSON.parse(rawBody);
        } catch {
          return new Response("JSON inválido", { status: 400 });
        }

        const serviceAccount = getServiceAccount();
        const spreadsheetId = process.env.REGISTRY_SPREADSHEET_ID || SPREADSHEET_ID_DEFAULT;

        // Handshake de verificação (passo único, feito na hora de criar a
        // assinatura na UI da Notion) — não tem assinatura ainda nesse ponto.
        if (typeof json.verification_token === "string") {
          console.log("Notion webhook verification_token:", json.verification_token);
          if (serviceAccount) {
            const sheetsToken = await getAccessToken(serviceAccount);
            await escreverCelula(sheetsToken, spreadsheetId, CELULA_VERIFICATION_TOKEN, json.verification_token);
          }
          return new Response("ok", { status: 200 });
        }

        const segredo = process.env.NOTION_WEBHOOK_SECRET;
        if (segredo) {
          const assinatura = request.headers.get("x-notion-signature");
          const valido = await verificarAssinatura(rawBody, assinatura, segredo);
          if (!valido) {
            console.warn("Notion webhook: assinatura inválida, ignorando evento.");
            return new Response("assinatura inválida", { status: 401 });
          }
        } else {
          console.warn("Notion webhook: NOTION_WEBHOOK_SECRET não configurado — aceitando evento sem validar origem.");
        }

        const sheetsToken = serviceAccount ? await getAccessToken(serviceAccount) : null;
        const resultado = await dispararCaptura(spreadsheetId, sheetsToken);
        console.log("Notion webhook: evento recebido —", resultado.motivo);
        return new Response(JSON.stringify(resultado), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
