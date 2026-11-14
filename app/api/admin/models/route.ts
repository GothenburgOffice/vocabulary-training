import { z } from "zod";
import { tierSchema } from "@/lib/admin/ai-settings";
import { HttpError, json } from "@/lib/server/http";
import { adminWrite } from "@/lib/server/route";
import { FeedbackUnavailable, listModels } from "@/lib/server/requesty-client";
import { storedApiKey } from "@/lib/server/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Either a key typed on the admin page (not saved yet) or a tier's stored key. Only the key
// goes to Requesty.
const requestSchema = z
  .object({ apiKey: z.string().trim().min(1).max(500).optional(), tier: tierSchema.optional() })
  .strict();

export const POST = adminWrite(
  { maxBytes: 4096, schema: requestSchema, invalid: "Send a key or a tier." },
  async ({ data }) => {
    try {
      const apiKey = data.apiKey || (data.tier && (await storedApiKey(data.tier)));
      if (!apiKey) throw new HttpError(400, "Save or enter an API key first.");
      return json(await listModels(apiKey));
    } catch (e) {
      if (e instanceof FeedbackUnavailable)
        return json({ error: "Requesty didn't return a model list. Check the key." }, 502);
      throw e;
    }
  },
);
