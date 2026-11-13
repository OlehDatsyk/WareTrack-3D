import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export const sortDirSchema = z.enum(["asc", "desc"]).default("asc");

export const idParam = z.object({ id: z.string().min(1).max(64) });

/** Optional string query param that treats "" as undefined. */
export const optionalString = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v : undefined));

export const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.enum(values), z.literal(""), z.literal("ALL")])
    .optional()
    .transform((v) => (v && v !== "ALL" ? (v as T[number]) : undefined));
