import { z } from "zod";
import { tierSchema } from "../../../../lib/admin/ai-settings";
import { requireAdmin } from "../../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../../lib/server/http";
import { FeedbackUnavailable, listModels } from "../../../../lib/server/requesty-client";
import { storedApiKey } from "../../../../lib/server/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Either a key typed on the admin page (not saved yet) or a tier's stored key. Only the key
// goes to Requesty.
const requestSchema = z
  .object({ apiKey: z.string().trim().min(1).max(500).optional(), tier: tierSchema.optional() })
  .strict();

export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireAdmin();
    const parsed = requestSchema.safeParse(await body(request, 4096));
    if (!parsed.success) throw new HttpError(400, "Send a key or a tier.");
    const apiKey =
      parsed.data.apiKey || (parsed.data.tier && (await storedApiKey(parsed.data.tier)));
    if (!apiKey) throw new HttpError(400, "Save or enter an API key first.");
    return json(await listModels(apiKey));
  } catch (e) {
    if (e instanceof FeedbackUnavailable)
      return json({ error: "Requesty didn't return a model list. Check the key." }, 502);
    return fail(e);
  }
}
