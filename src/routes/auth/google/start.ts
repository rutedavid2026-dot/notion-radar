import { createFileRoute } from "@tanstack/react-router";
import { setCookie } from "@tanstack/react-start/server";
import { STATE_COOKIE_NAME, buildRedirectUri, getGoogleClientId } from "@/lib/auth";

export const Route = createFileRoute("/auth/google/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const state = crypto.randomUUID();
        setCookie(STATE_COOKIE_NAME, state, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 10,
        });

        const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        url.searchParams.set("client_id", getGoogleClientId());
        url.searchParams.set("redirect_uri", buildRedirectUri(request.url));
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", "openid email profile");
        url.searchParams.set("state", state);
        url.searchParams.set("prompt", "select_account");

        return new Response(null, { status: 302, headers: { Location: url.toString() } });
      },
    },
  },
});
