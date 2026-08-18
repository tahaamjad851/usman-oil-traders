import { z } from "zod";

const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters long.")
  .max(128, "Password must be 128 characters or fewer.")
  .refine((value) => /[a-zA-Z]/.test(value) && /\d/.test(value), {
    message: "Password must include at least one letter and one number.",
  });

export const createStaffSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(50)
      .regex(/^[a-z0-9._-]+$/, "Username contains unsupported characters."),
    email: z.email().trim().toLowerCase().optional(),
    temporaryPassword: passwordSchema,
  })
  .superRefine((value, ctx) => {
    if (value.temporaryPassword.toLowerCase() === value.username) {
      ctx.addIssue({
        code: "custom",
        path: ["temporaryPassword"],
        message: "Password must not match the username.",
      });
    }
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
  });
