import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { BitrixModule } from '../bitrix/bitrix.module';
import { WappiModule } from '../wappi/wappi.module';

@Module({
  imports: [BitrixModule, WappiModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
