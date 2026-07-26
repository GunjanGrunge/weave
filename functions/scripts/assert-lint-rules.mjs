import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const root = fileURLToPath(new URL("..", import.meta.url));
const cases = [
  {
    file: join(root, "src/handlers/__lint-fixture__.ts"),
    source:
      'import { getFirestore } from "firebase-admin/firestore";\nexport const db = getFirestore();\n',
    message: "Handlers must go through services",
  },
  {
    file: join(root, "src/pipelines/__lint-fixture__.ts"),
    source:
      'import type { Request } from "firebase-functions/v2/https";\nexport type Bad = Request;\n',
    message: "Pipelines must not import",
  },
];

try {
  await Promise.all(cases.map((item) => writeFile(item.file, item.source)));

  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: join(root, "eslint.config.js"),
  });

  for (const lintCase of cases) {
    const [result] = await eslint.lintFiles([lintCase.file]);
    const messages = result?.messages.map((message) => message.message).join("\n") ?? "";

    if (!messages.includes(lintCase.message)) {
      throw new Error(`Expected lint rule failure for ${lintCase.file}, got:\n${messages}`);
    }
  }
} finally {
  await Promise.all(cases.map((item) => rm(item.file, { force: true })));
}
