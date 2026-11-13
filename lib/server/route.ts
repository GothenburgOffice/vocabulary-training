import "server-only";
import type { z } from "zod";
import { requireAdmin, requireUser } from "./auth";
import { body, fail, HttpError, requireOrigin } from "./http";
import { limitWrites } from "./write-limits";

// The guards every API route runs, in one place, so a new route can't get their order wrong.
// Pick the builder by who may call the route and whether it changes anything:
//
//   userRead    requireUser
//   userWrite   requireOrigin, requireUser, limitWrites, then the body
//   adminRead   requireAdmin
//   adminWrite  requireOrigin, requireAdmin, then the body
//
// A write's body is read up to maxBytes and, with a schema, parsed: a body that doesn't match
// answers 400 with `invalid`, or the schema's first message. Any error thrown by the guards or
// the handler goes through fail(), so an HttpError answers with its status and message.
// A handler that maps its own errors catches them and rethrows the rest.

type User = Awaited<ReturnType<typeof requireUser>>;
type Admin = Awaited<ReturnType<typeof requireAdmin>>;
type RouteContext = { params: Promise<Record<string, string>> };
type Schema = z.ZodType | undefined;
type Parsed<S extends Schema> = S extends z.ZodType ? z.infer<S> : unknown;

export type BodySpec<S extends Schema> = {
  // Required, so each route states its own limit.
  maxBytes: number;
  schema?: S;
  // The 400 message for a body the schema rejects; without it, the schema's first message.
  invalid?: string;
};
type Handler<Input, C> = (input: Input, context: C) => Promise<Response>;

async function readBody<S extends Schema>(request: Request, spec: BodySpec<S>) {
  const raw = await body(request, spec.maxBytes);
  if (!spec.schema) return raw as Parsed<S>;
  const parsed = spec.schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, spec.invalid ?? parsed.error.issues[0].message);
  return parsed.data as Parsed<S>;
}

function route<C>(run: (request: Request, context: C) => Promise<Response>) {
  return async (request: Request, context: C) => {
    try {
      return await run(request, context);
    } catch (e) {
      return fail(e);
    }
  };
}

export function userRead<C = RouteContext>(handler: Handler<{ request: Request; user: User }, C>) {
  return route<C>(async (request, context) =>
    handler({ request, user: await requireUser() }, context),
  );
}

export function userWrite<S extends Schema = undefined, C = RouteContext>(
  spec: BodySpec<S>,
  handler: Handler<{ request: Request; user: User; data: Parsed<S> }, C>,
) {
  return route<C>(async (request, context) => {
    requireOrigin(request);
    const user = await requireUser();
    await limitWrites(user.id);
    const data = await readBody(request, spec);
    return handler({ request, user, data }, context);
  });
}

export function adminRead<C = RouteContext>(
  handler: Handler<{ request: Request; admin: Admin }, C>,
) {
  return route<C>(async (request, context) =>
    handler({ request, admin: await requireAdmin() }, context),
  );
}

export function adminWrite<S extends Schema = undefined, C = RouteContext>(
  spec: BodySpec<S>,
  handler: Handler<{ request: Request; admin: Admin; data: Parsed<S> }, C>,
) {
  return route<C>(async (request, context) => {
    requireOrigin(request);
    const admin = await requireAdmin();
    const data = await readBody(request, spec);
    return handler({ request, admin, data }, context);
  });
}
