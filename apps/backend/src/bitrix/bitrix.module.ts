import { Module, forwardRef } from '@nestjs/common';
import { GatewayModule } from '../gateway/gateway.module';
import { WappiModule } from '../wappi/wappi.module';
import { BitrixController } from './bitrix.controller';
import { BitrixService } from './bitrix.service';

@Module({
  imports: [forwardRef(() => WappiModule), forwardRef(() => GatewayModule)],
  controllers: [BitrixController],
  providers: [BitrixService],
  exports: [BitrixService],
})
export class BitrixModule {}
