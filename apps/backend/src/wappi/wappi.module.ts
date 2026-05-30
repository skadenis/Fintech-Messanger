import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BitrixModule } from '../bitrix/bitrix.module';
import { GatewayModule } from '../gateway/gateway.module';
import { WappiHttpFileLoggerService } from './wappi-http-file-logger.service';
import { WappiLogsController } from './wappi-logs.controller';
import { WappiService } from './wappi.service';
import { WappiWebhookController } from './wappi.webhook.controller';
import { WappiProcessor } from './wappi.processor';

@Module({
  imports: [
    forwardRef(() => GatewayModule),
    forwardRef(() => BitrixModule),
    BullModule.registerQueue({
      name: 'wappi-events',
    }),
  ],
  controllers: [WappiWebhookController, WappiLogsController],
  providers: [WappiHttpFileLoggerService, WappiService, WappiProcessor],
  exports: [WappiService, WappiHttpFileLoggerService],
})
export class WappiModule {}
