import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { MessengerType, StartConversationRequest } from '@fintech/shared';
import { JwtAuthGuard, JwtPayload } from '../common/guards';
import { ConversationsService } from './conversations.service';

@Controller('api/conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  findAll(
    @Req() req: { user: JwtPayload },
    @Query('messenger') messenger?: MessengerType,
    @Query('contact_id') contactId?: string,
    @Query('contact_phone') contactPhone?: string,
    @Query('line_id') lineId?: string,
  ) {
    return this.conversationsService.findAll(req.user, {
      messenger,
      contactId,
      contactPhone,
      lineId,
    });
  }

  @Post('start')
  startConversation(
    @Req() req: { user: JwtPayload },
    @Body() dto: StartConversationRequest,
  ) {
    return this.conversationsService.startConversation(req.user, dto);
  }

  @Get(':id')
  findOne(@Req() req: { user: JwtPayload }, @Param('id') id: string) {
    return this.conversationsService.findOne(req.user, id);
  }
}
