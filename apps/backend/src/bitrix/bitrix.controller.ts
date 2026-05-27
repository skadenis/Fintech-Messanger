import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { BitrixSendMessageRequest } from '@fintech/shared';
import { BitrixApiKeyGuard } from '../common/guards';
import { BitrixService } from './bitrix.service';

@Controller('api/bitrix')
@UseGuards(BitrixApiKeyGuard)
export class BitrixController {
  constructor(private readonly bitrixService: BitrixService) {}

  @Post('send-message')
  sendMessage(@Body() dto: BitrixSendMessageRequest) {
    return this.bitrixService.sendMessage(dto);
  }
}
