const url = process.argv[2];
if (!url) throw new Error("Pass the health URL.");
const deadline = Date.now() + 60000;
while (true) {
  try {
    if ((await fetch(url)).ok) break;
  } catch {}
  if (Date.now() > deadline) throw new Error("Application did not become healthy.");
  await new Promise((r) => setTimeout(r, 500));
}
