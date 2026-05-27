import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SendFileMessageRequest, SendMessageRequest } from '@fintech/shared';
import { JwtAuthGuard, JwtPayload } from '../common/guards';
import { MessagesService } from './messages.service';

@Controller('api/conversations/:conversationId/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  findAll(
    @Req() req: { user: JwtPayload },
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.messagesService.findByConversation(req.user, conversationId, parsedLimit, cursor);
  }

  @Post()
  send(
    @Req() req: { user: JwtPayload },
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageRequest,
  ) {
    return this.messagesService.sendFromPanel(req.user, conversationId, dto);
  }

  @Post('file')
  @UseInterceptors(FileInterceptor('file'))
  sendFile(
    @Req() req: { user: JwtPayload },
    @Param('conversationId') conversationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SendFileMessageRequest,
  ) {
    return this.messagesService.sendFileFromPanel(
      req.user,
      conversationId,
      file,
      dto.caption,
    );
  }
}

@Controller('api/messages')
@UseGuards(JwtAuthGuard)
export class MessageAttachmentController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get(':messageId/attachment')
  getAttachment(
    @Req() req: { user: JwtPayload },
    @Param('messageId') messageId: string,
  ) {
    return this.messagesService.getAttachment(req.user, messageId);
  }
}
