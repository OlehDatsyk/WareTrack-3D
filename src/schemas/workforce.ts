import { z } from "zod";
import { optionalEnum, optionalString, paginationSchema } from "./common";

export const employeeRoles = ["SUPERVISOR", "FORKLIFT_OPERATOR", "PICKER", "PACKER", "LOADER", "DRIVER", "INVENTORY_CLERK"] as const;
export const shifts = ["MORNING", "AFTERNOON", "NIGHT"] as const;
export const employeeStatuses = ["ON_SHIFT", "ON_BREAK", "OFF_SHIFT", "ON_LEAVE"] as const;

export const employeeSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(40),
  lastName: z.string().trim().min(1, "Last name is required").max(40),
  email: z.email("Enter a valid email").max(120),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+()\d\s-]*$/, "Use digits, spaces, +, - and parentheses")
    .optional()
    .nullable(),
  role: z.enum(employeeRoles),
  shift: z.enum(shifts),
  status: z.enum(employeeStatuses).default("OFF_SHIFT"),
  zoneId: z.string().optional().nullable().or(z.literal("").transform(() => null)),
  hireDate: z.coerce.date({ error: "Choose a hire date" }),
  certifications: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});

export const employeeUpdateSchema = employeeSchema.partial();

export const employeeQuerySchema = paginationSchema.extend({
  q: optionalString,
  role: optionalEnum(employeeRoles),
  shift: optionalEnum(shifts),
  status: optionalEnum(employeeStatuses),
});
export type EmployeeQuery = z.infer<typeof employeeQuerySchema>;

export const assignEmployeeTaskSchema = z.object({ taskId: z.string().min(1, "Choose a task") });
