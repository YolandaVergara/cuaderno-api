import { z } from "zod";

export const GetNotificationsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    unreadOnly: z
      .union([z.string(), z.boolean()])
      .optional()
      .transform(v => (v === true || v === "true")),
    since: z.string().datetime().optional(),
  }),
});

export type GetNotificationsInput = z.infer<typeof GetNotificationsSchema>;
