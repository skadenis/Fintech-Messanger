import { Module } from '@nestjs/common';
import { AccessService } from '../common/access.service';
import { LinesController } from './lines.controller';
import { LinesService } from './lines.service';

@Module({
  controllers: [LinesController],
  providers: [LinesService, AccessService],
  exports: [LinesService],
})
export class LinesModule {}
