import { createFileRoute } from "@tanstack/react-router";

// Recebe eventos do webhook de integração do Notion (qualquer mudança em
// qualquer database/página compartilhada com a integração "relatorio-semanal"
// / NOTION_API_KEY_2 — hoje cobre todos os 29 condomínios, ver memória do
// projeto). Ao chegar um evento real, dispara o workflow do GitHub Actions
// que já faz a captura completa (scripts/capturar-historico-sheets.mjs),
// pra não duplicar a lógica de sincronização aqui.
//
// Setup (ver instruções passadas no chat):
//   1. notion.so/my-integrations -> sua integração -> aba "Webhooks" ->
//      "+ Create a subscription" -> URL: https://SEU_DOMINIO/webhooks/notion
//   2. A Notion manda um POST único com { verification_token }. Esta rota
//      guarda esse token em memória — acesse a mesma URL via GET logo em
//      seguida (poucos segundos depois) pra ver o token e colar de volta na
//      UI da Notion, no botão "Verify".
//      Atenção: a memória não sobrevive a um cold start/reinício do runtime
//      — se o GET não mostrar nada, crie a assinatura de novo e tente mais
//      rápido, ou confira os logs de runtime do seu provedor de deploy.
//   3. Depois de verificado, a Notion te dá um "signing_secret" — configure
//      como variável de ambiente NOTION_WEBHOOK_SECRET pra habilitar a
//      validação de assinatura (sem ela, a rota aceita eventos sem checar
//      origem — funciona, mas fica aberta a chamadas forjadas).
//   4. Configure também GH_WORKFLOW_TOKEN (Personal Access Token do GitHub
//      com escopo "workflow" ou "actions:write") e, opcionalmente, GH_REPO
//      (formato "dono/repo"; default já aponta pro repo atual) — é o que
//      permite esta rota disparar o workflow de captura.

const GH_REPO_DEFAULT = "rutedavid2026-dot/notion-radar";
const GH_WORKFLOW_FILE = "capturar-historico-sheets.yml";

// Estado em memória (best-effort, não sobrevive a cold start — ver nota
// acima). Serve só pro passo manual de verificação inicial.
let ultimoVerificationToken: string | null = null;

// Debounce simples: a síndica editando várias linhas em sequência dispara um
// evento por edição — sem isso, cada uma dispara uma captura completa
// (29 condomínios) em paralelo, arriscando estourar a cota de escrita do
// Sheets API de novo (ver histórico do projeto, 2026-08-24). Só permite 1
// disparo a cada 2 minutos; eventos dentro da janela são ignorados (a
// próxima captura já vai pegar a mudança).
const JANELA_DEBOUNCE_MS = 2 * 60 * 1000;
let ultimoDisparoEm = 0;

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

async function dispararCaptura(): Promise<{ disparado: boolean; motivo: string }> {
  const agora = Date.now();
  if (agora - ultimoDisparoEm < JANELA_DEBOUNCE_MS) {
    return { disparado: false, motivo: "debounce (evento recente, próxima captura já cobre)" };
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
  ultimoDisparoEm = agora;
  return { disparado: true, motivo: "workflow_dispatch enviado" };
}

export const Route = createFileRoute("/webhooks/notion")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(
          ultimoVerificationToken
            ? `verification_token: ${ultimoVerificationToken}`
            : "Nenhum verification_token em memória (cria uma assinatura na Notion e confira aqui logo em seguida).",
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

        // Handshake de verificação (passo único, feito na hora de criar a
        // assinatura na UI da Notion) — não tem assinatura ainda nesse ponto.
        if (typeof json.verification_token === "string") {
          ultimoVerificationToken = json.verification_token;
          console.log("Notion webhook verification_token:", json.verification_token);
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

        const resultado = await dispararCaptura();
        console.log("Notion webhook: evento recebido —", resultado.motivo);
        return new Response(JSON.stringify(resultado), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
