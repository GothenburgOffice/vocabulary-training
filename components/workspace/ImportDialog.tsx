import { useState } from "react";
import { FilePlus2 } from "lucide-react";
import { parseCSV, wordFromCSV, type List } from "../../lib/learning";
import Button from "./Button";

export default function ImportDialog({
  baseLanguage,
  codes,
  onImport,
}: {
  baseLanguage: string;
  // Old-style language codes (sv, fr) to language names.
  codes: Record<string, string>;
  // Receives the imported words as a new, unsaved list.
  onImport: (draft: List) => void;
}) {
  const [csv, setCsv] = useState("");
  const [error, setError] = useState("");
  function preview() {
    try {
      const rows = parseCSV(csv);
      if (rows.length < 2) throw new Error("Include a language header and at least one word pair.");
      const [from, to] = rows[0].map((x) => codes[x.trim().toLowerCase()] || x.trim());
      if (from !== baseLanguage)
        throw new Error(
          `This CSV uses ${from} as its base language. Your profile uses ${baseLanguage}. Change your profile first to import it; existing lists will not be changed.`,
        );
      if (from === to) throw new Error("The CSV must contain two different languages.");
      const words = rows.slice(1).map(([a, b]) => wordFromCSV(a, b));
      if (!from || !to || words.some((w) => !w.front || !w.back))
        throw new Error("Language names and both sides of every pair are required.");
      onImport({
        id: crypto.randomUUID(),
        title: "Imported word list",
        description: "",
        from,
        to,
        words,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <p>
        Paste a two-column CSV. The first row contains language names or old-style codes such as
        sv,fr. Following rows contain word pairs. To accept more than one answer, separate them with
        | in the second column, for example chat|minou. The first one is shown when you practise.
        For a | that is part of the answer, write \|. Exports use the same format.
      </p>
      <label className="field">
        CSV contents
        <textarea
          rows={7}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={"sv,fr\nhej,bonjour\ntack,merci"}
        />
      </label>
      <label className="file-input">
        Or choose a .csv file
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              setCsv(await f.text());
              setError("");
            }
          }}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button primary onClick={preview} disabled={!csv.trim()}>
        <FilePlus2 size={16} /> Preview imported words
      </Button>
    </>
  );
}
