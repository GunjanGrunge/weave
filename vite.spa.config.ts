import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tanstackRouter from "@tanstack/router-plugin/vite";

const devHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WEAVE</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/spa.tsx"></script>
  </body>
</html>`;

function spaDevHtml(): Plugin {
  return {
    name: "spa-dev-html",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.method !== "GET" || !request.headers.accept?.includes("text/html")) {
          next();
          return;
        }

        try {
          const html = await server.transformIndexHtml(request.url ?? "/", devHtml);
          response.statusCode = 200;
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.end(html);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig({
  css: {
    transformer: "lightningcss",
  },
  resolve: {
    tsconfigPaths: true,
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  plugins: [
    spaDevHtml(),
    tanstackRouter({ target: "react", routeFileIgnorePattern: "\\.test\\." }),
    tailwindcss(),
    react(),
  ],
  build: {
    emptyOutDir: true,
    outDir: ".output/public",
    rollupOptions: {
      input: "src/spa.tsx",
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
