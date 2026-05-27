import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { MessengerType } from '@fintech/shared';
import { JwtAuthGuard, JwtPayload } from '../common/guards';
import { LinesService } from './lines.service';

@Controller('api/lines')
@UseGuards(JwtAuthGuard)
export class LinesController {
  constructor(private readonly linesService: LinesService) {}

  @Get()
  findAll(
    @Req() req: { user: JwtPayload },
    @Query('messenger') messenger?: MessengerType,
  ) {
    return this.linesService.findAll(req.user, messenger);
  }
}
