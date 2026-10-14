import { z } from 'zod'

/** Limits mirrored from `CategoryName` in `backend/app/schemas/categories.py`. */
export const CATEGORY_NAME_MAX_LENGTH = 100

export const CATEGORY_NAME_REQUIRED = 'Name is required'
export const CATEGORY_NAME_TOO_LONG = `Name must be at most ${CATEGORY_NAME_MAX_LENGTH} characters`

/** A category name: trimmed, then 1–100 characters. The trimmed value is what gets sent. */
export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, { error: CATEGORY_NAME_REQUIRED })
  .max(CATEGORY_NAME_MAX_LENGTH, { error: CATEGORY_NAME_TOO_LONG })
