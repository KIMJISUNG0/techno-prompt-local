import { z } from 'zod';

export const TaskSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(['MUSIC_GENERATE', 'MIX_DOWN', 'STEM_SPLIT']),
  prompt: z.string().min(4),
  params: z.record(z.any()).default({}),
  createdAt: z.number().default(() => Date.now()),
});

export type Task = z.infer<typeof TaskSchema>;

export function normalizeTask(input: unknown): Task {
  const parsed = TaskSchema.parse(input);
  return { ...parsed, id: parsed.id ?? crypto.randomUUID() };
}
