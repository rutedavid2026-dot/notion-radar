import { createServerFn } from "@tanstack/react-start";
import { getSession } from "@tanstack/react-start/server";
import { getSessionConfig, type AuthSessionData } from "./auth";

export const getCurrentUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthSessionData | null> => {
    const session = await getSession<AuthSessionData>(getSessionConfig());
    const email = session.data.email;
    return email ? { email } : null;
  },
);
