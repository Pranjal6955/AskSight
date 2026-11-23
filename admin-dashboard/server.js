import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 5173);
const backend = process.env.BACKEND_URL || "http://localhost:8000";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};
const proxied = ["/auth", "/images", "/ask", "/health", "/admin"];

function isProxied(pathname) {
  return proxied.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

async function sendFile(res, file) {
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

function proxy(req, res, target) {
  const upstream = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (response) => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    },
  );

  upstream.on("error", () => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        detail: `Backend is not reachable at ${backend}. Start it with uvicorn.`,
      }),
    );
  });

  req.pipe(upstream);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");

    if (isProxied(url.pathname)) {
      proxy(req, res, new URL(req.url || "/", backend));
      return;
    }
    if (url.pathname === "/") {
      sendFile(res, path.join(root, "index.html"));
      return;
    }
    if (url.pathname === "/style.css") {
      sendFile(res, path.join(root, "style.css"));
      return;
    }
    if (url.pathname.startsWith("/dist/")) {
      sendFile(res, path.join(root, url.pathname.slice(1)));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  })
  .listen(port, () => {
    console.log(`Dashboard: http://localhost:${port}  (API -> ${backend})`);
  });
