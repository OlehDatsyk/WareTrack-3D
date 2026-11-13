import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { ZodError, type ZodType } from "zod";
import { db } from "@/server/db";
import { AppError, badRequest, forbidden, notFound, unauthorized } from "@/server/errors";
import { validateSession, type SessionUser } from "@/server/auth/service";
import { SESSION_COOKIE } from "@/server/auth/tokens";
import { can, type Permission } from "@/lib/permissions";
import { Prisma } from "@/generated/prisma/client";

export type RouteContext<P = Record<string, string>> = {
  req: NextRequest;
  user: SessionUser;
  params: P;
  ip: string | null;
  /** Resolves the warehouse in scope: ?warehouseId=, x-warehouse-id header, user default, then first. */
  warehouseId: () => Promise<string>;
  json: <T>(schema: ZodType<T>) => Promise<T>;
  query: <T>(schema: ZodType<T>) => T;
};

type Handler<P> = (ctx: RouteContext<P>) => Promise<unknown>;

type Options = {
  /** Required permission. Omit to allow any authenticated user. */
  permission?: Permission;
};

export function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

export function errorResponse(err: unknown): NextResponse {
  unstable_rethrow(err);
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: err.issues[0]?.message ?? "Invalid input",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 400 },
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "A record with these unique values already exists" } },
        { status: 409 },
      );
    }
    if (err.code === "P2025") {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Record not found" } }, { status: 404 });
    }
    if (err.code === "P2003") {
      return NextResponse.json(
        { error: { code: "IN_USE", message: "This record is referenced by other records and cannot be removed" } },
        { status: 409 },
      );
    }
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } },
    { status: 500 },
  );
}

async function readJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
  return schema.parse(body);
}

/**
 * Wraps a route handler with authentication, permission checks, input helpers and
 * consistent error responses. Returning a Response passes it through; any other
 * value is serialised as `{ data }`.
 */
export function route<P = Record<string, string>>(options: Options, handler: Handler<P>) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      const user = await validateSession(db, req.cookies.get(SESSION_COOKIE)?.value);
      if (!user) throw unauthorized();
      if (options.permission && !can(user.role, options.permission)) throw forbidden();

      const params = (await context?.params) ?? ({} as P);
      let cachedWarehouse: string | null = null;
      const ctx: RouteContext<P> = {
        req,
        user,
        params,
        ip: clientIp(req),
        json: (schema) => readJson(req, schema),
        query: (schema) => schema.parse(Object.fromEntries(req.nextUrl.searchParams)),
        warehouseId: async () => {
          if (cachedWarehouse) return cachedWarehouse;
          const requested =
            req.nextUrl.searchParams.get("warehouseId") ?? req.headers.get("x-warehouse-id") ?? user.defaultWarehouseId;
          const wh = requested
            ? await db.warehouse.findUnique({ where: { id: requested }, select: { id: true } })
            : await db.warehouse.findFirst({ orderBy: { code: "asc" }, select: { id: true } });
          if (!wh) throw notFound("Warehouse");
          cachedWarehouse = wh.id;
          return wh.id;
        },
      };

      const result = await handler(ctx);
      if (result instanceof Response) return result;
      return NextResponse.json({ data: result ?? null });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Same error handling as `route`, without requiring a session (login, register, health). */
export function publicRoute<P = Record<string, string>>(
  handler: (req: NextRequest, params: P) => Promise<unknown>,
) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      const result = await handler(req, ((await context?.params) ?? {}) as P);
      if (result instanceof Response) return result;
      return NextResponse.json({ data: result ?? null });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
