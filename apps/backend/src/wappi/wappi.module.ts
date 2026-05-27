import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GatewayModule } from '../gateway/gateway.module';
import { WappiService } from './wappi.service';
import { WappiWebhookController } from './wappi.webhook.controller';
import { WappiProcessor } from './wappi.processor';

@Module({
  imports: [
    forwardRef(() => GatewayModule),
    BullModule.registerQueue({
      name: 'wappi-events',
    }),
  ],
  controllers: [WappiWebhookController],
  providers: [WappiService, WappiProcessor],
  exports: [WappiService],
})
export class WappiModule {}
