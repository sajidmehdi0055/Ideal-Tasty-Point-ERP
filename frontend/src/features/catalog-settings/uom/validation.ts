import { z } from 'zod';
import { UNIT_TYPES } from './types';

/** Mirrors backend/src/inventory/domain/uom.ts's uomInputSchema exactly. */
const requiredText = z
  .string()
  .trim()
  .min(1, 'Required')
  .refine(value => !value.includes(String.fromCharCode(0)), 'NUL characters are invalid');

export const uomInputSchema = z.object({
  name: requiredText,
  unit_type: z.enum(UNIT_TYPES),
});

export type UomFormValues = z.infer<typeof uomInputSchema>;

export type UomFieldErrors = Partial<Record<keyof UomFormValues, string>>;

export interface RawUomFormValues {
  name: string;
  unit_type: string;
}

export function validateUomForm(values: RawUomFormValues): { data?: UomFormValues; errors: UomFieldErrors } {
  const result = uomInputSchema.safeParse(values);
  if (result.success) return { data: result.data, errors: {} };

  const errors: UomFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field !== 'string') continue;
    if (field === 'unit_type') {
      errors[field] = 'Select a unit type';
      continue;
    }
    if (field in uomInputSchema.shape) errors[field as keyof UomFormValues] = issue.message;
  }
  return { errors };
}
