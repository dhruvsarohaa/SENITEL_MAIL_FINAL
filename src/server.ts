import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      if (new URL(request.url).pathname.startsWith("/api/")) {
        const parsedUrl = new URL(request.url);
        const backendUrl = (process.env["BACKEND_URL"] || "http://localhost:3001").replace(
          /\/$/,
          "",
        );
        const targetUrl = `${backendUrl}${parsedUrl.pathname}${parsedUrl.search}`;
        try {
          const forwardRes = await fetch(targetUrl, {
            method: request.method,
            headers: request.headers,
            body: request.body,
            // @ts-expect-error duplex required by node fetch with stream bodies
            duplex: "half",
          });
          return forwardRes;
        } catch (proxyErr) {
          console.error(
            `Express backend unreachable at ${backendUrl}. ` +
              "Start it with 'npm run server' or use 'npm run dev:full'.",
            proxyErr,
          );
          return new Response(
            JSON.stringify({
              message:
                "API backend is not running. Start the Express server with 'npm run server' or use 'npm run dev:full'.",
            }),
            {
              status: 502,
              headers: { "content-type": "application/json; charset=utf-8" },
            },
          );
        }
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
