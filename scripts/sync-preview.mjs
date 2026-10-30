// Build the same workspace UI as a static, explicitly sample-data preview.
// Set PREVIEW_PROJECT to the existing preview source directory, not its output.
import { cp, mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const target = process.env.PREVIEW_PROJECT;
if (!target) throw new Error("Set PREVIEW_PROJECT to the existing preview project directory.");
const destination = resolve(target);
if (destination === resolve(root)) throw new Error("Preview project must be separate from the account app.");
await mkdir(`${destination}/components`, { recursive: true });
await mkdir(`${destination}/lib`, { recursive: true });
for (const file of ["components/Workspace.tsx", "app/style.css", "lib/learning.ts", "lib/workspace.ts", "lib/sample.ts"]) {
  await cp(resolve(root, file), resolve(destination, file));
}
await writeFile(resolve(destination, "app/page.tsx"), 'import Workspace from "../components/Workspace";\nexport default function Page() { return <Workspace demo/>; }\n');
// This command only copies source; run the preview project's static build separately.
console.log("Shared workspace UI synchronized. Account APIs and secrets were not copied.");
