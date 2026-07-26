import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const publicDir = join(process.cwd(), ".output", "public");
const assetsDir = join(publicDir, "assets");
const assets = await readdir(assetsDir);

const entry = assets.find((asset) => /^spa-.+\.js$/.test(asset));
const stylesheet = assets.find((asset) => /^styles-.+\.css$/.test(asset));

if (!entry) {
  throw new Error("Could not find built client entry asset in .output/public/assets");
}

const styleLink = stylesheet ? `    <link rel="stylesheet" href="/assets/${stylesheet}" />\n` : "";

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Story Platform</title>
    <meta
      name="description"
      content="A premium AI-first workspace for planning, drafting, refactoring, and publishing books."
    />
    <link rel="icon" href="/favicon.ico" type="image/x-icon" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Playfair+Display:ital,wght@1,600;1,700&family=JetBrains+Mono:wght@400;500;600&display=swap"
    />
${styleLink}    <script type="module" src="/assets/${entry}"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

await writeFile(join(publicDir, "index.html"), html);
