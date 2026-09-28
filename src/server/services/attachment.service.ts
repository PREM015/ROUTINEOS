import { z } from 'zod';
import {
  AttachmentRepository,
  type AttachmentQueryOptions,
} from '@/server/repositories/attachment.repository';
import type { Attachment } from '@/generated/prisma';

/**
 * Attachment Service
 * Lists a user's attachments with a matching total.
 *
 * The route previously issued the list and count queries itself, which let the
 * two drift: a filter applied to one and not the other would report a total
 * that did not match the rows. Both now go through one `list()` so the filter
 * is applied once, here.
 */

const listSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  entityType: z.string().min(1).max(50).optional(),
  entityId: z.string().min(1).max(50).optional(),
});

export type ListAttachmentsInput = z.infer<typeof listSchema>;

export interface AttachmentListResult {
  attachments: Attachment[];
  total: number;
  limit: number;
  offset: number;
}

export class AttachmentService {
  private attachmentRepository: AttachmentRepository;

  constructor() {
    this.attachmentRepository = new AttachmentRepository();
  }

  async list(
    userId: string,
    input: Partial<ListAttachmentsInput> = {},
  ): Promise<AttachmentListResult> {
    const parsed = listSchema.safeParse(input);
    if (!parsed.success) {
      throw new RangeError(parsed.error.errors[0]?.message ?? 'Invalid query parameters');
    }

    const { limit, offset, entityType, entityId } = parsed.data;
    const options: AttachmentQueryOptions = { limit, offset, entityType, entityId };

    const [attachments, total] = await Promise.all([
      this.attachmentRepository.findAllByUser(userId, options),
      // The count must use the same filter, minus pagination.
      this.attachmentRepository.countByUser(userId, { entityType, entityId }),
    ]);

    return { attachments, total, limit, offset };
  }
}

export const attachmentService = new AttachmentService();
