import { z } from 'zod'

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  type: z.enum(['live', 'uploaded_file']).optional(),
  search: z.string().trim().min(1).max(200).optional(),
})

export const idParamSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
})

export type ListQuery = z.infer<typeof listQuerySchema>
