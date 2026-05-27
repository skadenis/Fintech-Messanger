import { Module, forwardRef } from '@nestjs/common';
import { GatewayModule } from '../gateway/gateway.module';
import { WappiService } from './wappi.service';
import { WappiWebhookController } from './wappi.webhook.controller';

@Module({
  imports: [forwardRef(() => GatewayModule)],
  controllers: [WappiWebhookController],
  providers: [WappiService],
  exports: [WappiService],
})
export class WappiModule {}
