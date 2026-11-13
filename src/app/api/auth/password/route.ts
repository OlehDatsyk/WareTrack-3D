import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { changePassword } from "@/server/auth/service";
import { changePasswordSchema } from "@/schemas/auth";
import { audit } from "@/server/audit";

export const POST = route({}, async ({ user, json, ip }) => {
  const input = await json(changePasswordSchema);
  await changePassword(db, user.id, input.currentPassword, input.newPassword);
  await audit(db, { userId: user.id, action: "auth.password_changed", entityType: "User", entityId: user.id, ip });
  return { ok: true };
});
