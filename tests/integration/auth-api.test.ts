import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { authenticate, createSession, destroySession, registerUser, validateSession } from "@/server/auth/service";
import { hashToken } from "@/server/auth/tokens";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { GET as meRoute } from "@/app/api/auth/me/route";
import { GET as productsGet, POST as productsPost } from "@/app/api/products/route";
import { DELETE as productDelete } from "@/app/api/products/[id]/route";
import { GET as usersGet } from "@/app/api/users/route";
import { checkHealth } from "@/server/services/health";
import { GET as exportRoute } from "@/app/api/products/export/route";
import { TEST_PASSWORD, call, mainWarehouse, resetDatabase, sessionFor } from "../helpers";

beforeAll(resetDatabase);

describe("authentication service", () => {
  it("authenticates valid credentials and rejects wrong passwords", async () => {
    const user = await authenticate(db, "manager@waretrack.demo", TEST_PASSWORD);
    expect(user.role).toBe("MANAGER");
    expect(user).not.toHaveProperty("passwordHash");
    await expect(authenticate(db, "manager@waretrack.demo", "wrong")).rejects.toMatchObject({ status: 401 });
    await expect(authenticate(db, "nobody@waretrack.demo", TEST_PASSWORD)).rejects.toMatchObject({ status: 401 });
  });

  it("stores only a hash of the session token", async () => {
    const user = await db.user.findFirstOrThrow({ where: { role: "VIEWER" } });
    const { token } = await createSession(db, user.id);
    const stored = await db.session.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    expect(stored?.tokenHash).toBe(hashToken(token));
    expect(stored?.tokenHash).not.toBe(token);
    expect((await validateSession(db, token))?.id).toBe(user.id);
    await destroySession(db, token);
    expect(await validateSession(db, token)).toBeNull();
  });

  it("expires sessions and rejects disabled accounts", async () => {
    const user = await db.user.findFirstOrThrow({ where: { role: "OPERATOR" } });
    const { token } = await createSession(db, user.id);
    await db.session.updateMany({ where: { tokenHash: hashToken(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await validateSession(db, token)).toBeNull();

    const fresh = await createSession(db, user.id);
    await db.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect(await validateSession(db, fresh.token)).toBeNull();
    await db.user.update({ where: { id: user.id }, data: { isActive: true } });
  });

  it("registers new users as read-only viewers and blocks duplicates", async () => {
    const u = await registerUser(db, { name: "New Person", email: "New.Person@Example.com", password: "Strong#Pass1" });
    expect(u.role).toBe("VIEWER");
    expect(u.email).toBe("new.person@example.com");
    await expect(registerUser(db, { name: "Dup", email: "new.person@example.com", password: "Strong#Pass1" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("auth routes", () => {
  it("logs in, sets an httpOnly cookie and logs out", async () => {
    const res = await call(loginRoute, "/api/auth/login", { method: "POST", body: { email: "admin@waretrack.demo", password: TEST_PASSWORD } });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/wt_session=/);
    expect(cookie.toLowerCase()).toContain("httponly");
    const token = /wt_session=([^;]+)/.exec(cookie)![1]!;
    const me = await call(meRoute, "/api/auth/me", { token });
    expect(me.status).toBe(200);
    expect((me.json.data as { user: { role: string } }).user.role).toBe("ADMIN");
    const out = await call(logoutRoute, "/api/auth/logout", { method: "POST", token });
    expect(out.status).toBe(200);
    expect((await call(meRoute, "/api/auth/me", { token })).status).toBe(401);
  });

  it("returns a generic error for bad credentials and validates input", async () => {
    const bad = await call(loginRoute, "/api/auth/login", { method: "POST", body: { email: "admin@waretrack.demo", password: "nope" }, headers: { "x-forwarded-for": "10.0.0.1" } });
    expect(bad.status).toBe(401);
    expect(bad.json.error?.message).toBe("Invalid email or password");
    const invalid = await call(loginRoute, "/api/auth/login", { method: "POST", body: { email: "not-an-email" } });
    expect(invalid.status).toBe(400);
    expect(invalid.json.error?.code).toBe("VALIDATION_ERROR");
  });

  it("rate-limits repeated sign-in attempts", async () => {
    let last = 0;
    for (let i = 0; i < 10; i++) {
      const r = await call(loginRoute, "/api/auth/login", { method: "POST", body: { email: "viewer@waretrack.demo", password: "wrong" }, headers: { "x-forwarded-for": "10.9.9.9" } });
      last = r.status;
    }
    expect(last).toBe(429);
  });

  it("registers through the API with a session cookie", async () => {
    const r = await call(registerRoute, "/api/auth/register", {
      method: "POST",
      body: { name: "Api User", email: "api.user@example.com", password: "Strong#Pass1", confirmPassword: "Strong#Pass1" },
      headers: { "x-forwarded-for": "10.1.1.1" },
    });
    expect(r.status).toBe(201);
    expect(r.headers.get("set-cookie")).toMatch(/wt_session=/);
  });

  it("records login attempts in the audit log", async () => {
    expect(await db.auditLog.count({ where: { action: "auth.login" } })).toBeGreaterThan(0);
    expect(await db.auditLog.count({ where: { action: "auth.login_failed" } })).toBeGreaterThan(0);
  });
});

describe("API authorisation (enforced on the server)", () => {
  it("rejects requests without a session", async () => {
    const r = await call(productsGet, "/api/products");
    expect(r.status).toBe(401);
  });

  it("lets viewers read but not write", async () => {
    const { token } = await sessionFor("VIEWER");
    const wh = await mainWarehouse();
    expect((await call(productsGet, "/api/products", { token, warehouseId: wh.id })).status).toBe(200);
    const create = await call(productsPost, "/api/products", {
      method: "POST",
      token,
      body: { sku: "VIEW-001", name: "Nope", category: "Tools", unitWeightKg: 1, unitCost: 1, reorderLevel: 1, reorderQty: 1 },
    });
    expect(create.status).toBe(403);
    expect(await db.product.count({ where: { sku: "VIEW-001" } })).toBe(0);
  });

  it("lets managers create products and validates the payload", async () => {
    const { token } = await sessionFor("MANAGER");
    const ok = await call(productsPost, "/api/products", {
      method: "POST",
      token,
      body: { sku: "MGR-001", name: "Manager Item", category: "Tools", unitWeightKg: 1, unitCost: 3.5, reorderLevel: 5, reorderQty: 10 },
    });
    expect(ok.status).toBe(200);
    const dup = await call(productsPost, "/api/products", {
      method: "POST",
      token,
      body: { sku: "MGR-001", name: "Again", category: "Tools", unitWeightKg: 1, unitCost: 1, reorderLevel: 1, reorderQty: 1 },
    });
    expect(dup.status).toBe(409);
    const invalid = await call(productsPost, "/api/products", { method: "POST", token, body: { sku: "x" } });
    expect(invalid.status).toBe(400);
  });

  it("blocks operators from deleting products and non-admins from user management", async () => {
    const product = await db.product.findFirstOrThrow({ where: { sku: "MGR-001" } });
    const op = await sessionFor("OPERATOR");
    expect((await call(productDelete, `/api/products/${product.id}`, { method: "DELETE", token: op.token }, { id: product.id })).status).toBe(403);
    const mgr = await sessionFor("MANAGER");
    expect((await call(usersGet, "/api/users", { token: mgr.token })).status).toBe(403);
    const admin = await sessionFor("ADMIN");
    expect((await call(usersGet, "/api/users", { token: admin.token })).status).toBe(200);
    // a product without history is hard-deleted
    const del = await call(productDelete, `/api/products/${product.id}`, { method: "DELETE", token: mgr.token }, { id: product.id });
    expect(del.status).toBe(200);
    expect((del.json.data as { archived: boolean }).archived).toBe(false);
  });

  it("exports inventory as CSV", async () => {
    const { token } = await sessionFor("VIEWER");
    const r = await call(exportRoute, "/api/products/export?category=Packaging", { token });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/csv");
    expect(r.text.split("\n")[0]).toContain("SKU");
    expect(r.text).toContain("PKG-");
  });

  it("reports database health", async () => {
    const r = await checkHealth(db);
    expect(r.ok).toBe(true);
    expect(r.body).toMatchObject({ status: "ok", database: "up" });
  });
});
