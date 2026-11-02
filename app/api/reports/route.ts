import { reportRequestSchema } from "../../../lib/reports";
import { createReport, readRecentActivity } from "../../../lib/server/activity-reports";
import { requireUser } from "../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return json({ activities: await readRecentActivity(user.id) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser();
    const parsed = reportRequestSchema.safeParse(await body(request, 2_000));
    if (!parsed.success) throw new HttpError(400, "Choose recent activity and an issue reason.");
    return json(
      { report: await createReport(user.id, parsed.data.activityId, parsed.data.reason) },
      201,
    );
  } catch (error) {
    return fail(error);
  }
}
