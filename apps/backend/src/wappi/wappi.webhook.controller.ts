import { Body, Controller, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Controller('webhooks/wappi')
export class WappiWebhookController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('wappi-events') private readonly wappiEventQueue: Queue,
  ) {}

  @Post()
  async handleWebhook(@Body() body: unknown) {
    const messages = Array.isArray((body as { messages?: unknown[] })?.messages)
      ? (body as { messages: Record<string, unknown>[] }).messages
      : [(body as { messages?: Record<string, unknown> }).messages ?? body].filter(Boolean);

    for (const payload of messages as Record<string, unknown>[]) {
      const profileId = payload.profile_id;
      if (typeof profileId !== 'string' || !profileId) continue;

      // Ищем линию по wappiProfileId (он приходит в каждом сообщении вебхука)
      const line = await this.prisma.wappiLine.findFirst({ 
        where: { wappiProfileId: profileId } 
      });

      if (!line) continue;

      // Adding event to the queue for background processing
      await this.wappiEventQueue.add('process-wappi-event', {
        lineId: line.id,
        payload,
      });
    }

    return { ok: true };
  }
}
