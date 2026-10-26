import { z } from "zod";

export const emailSchema = z.string().trim().email().max(254);

export const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(12).max(256),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

export const organizationSchema = z.object({
  name: z.string().trim().max(160),
  activity: z.string().trim().max(160),
  customActivity: z.string().trim().max(240).optional(),
  siren: z.string().regex(/^\d{9}$/).optional().or(z.literal("")),
  siret: z.string().regex(/^\d{14}$/).optional().or(z.literal("")),
  legalForm: z.string().trim().max(180).optional(),
  address: z.string().trim().max(500).optional(),
  postalCode: z.string().trim().max(20).optional(),
  city: z.string().trim().max(120).optional(),
  website: z.string().trim().max(500).optional(),
  configurationData: z.record(z.string(), z.any()).optional(),
  configurationIncomplete: z.boolean().optional(),
});

export function isValidLuhn(value: string) {
  let sum = 0;
  const parity = value.length % 2;

  for (let i = 0; i < value.length; i += 1) {
    let digit = Number(value[i]);
    if (i % 2 === parity) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }

  return sum % 10 === 0;
}
