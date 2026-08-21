export const SESSION_COOKIE_NAME = "equipe_sindicas_auth";
export const STATE_COOKIE_NAME = "google_oauth_state";

export type AuthSessionData = { email: string };

export function getSessionConfig() {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error(
      "SESSION_SECRET não configurado (ou com menos de 32 caracteres). " +
        "Configure essa variável de ambiente com uma string aleatória longa.",
    );
  }
  return {
    password,
    name: SESSION_COOKIE_NAME,
    maxAge: 60 * 60 * 24 * 30,
    cookie: {
      secure: true,
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

export function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string): boolean {
  return getAllowedEmails().includes(email.trim().toLowerCase());
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ${name} não configurada.`);
  }
  return value;
}

export function getGoogleClientId(): string {
  return requireEnv("GOOGLE_CLIENT_ID");
}

export function getGoogleClientSecret(): string {
  return requireEnv("GOOGLE_CLIENT_SECRET");
}

export function buildRedirectUri(requestUrl: string): string {
  const origin = new URL(requestUrl).origin;
  return `${origin}/auth/google/callback`;
}
