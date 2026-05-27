import { Injectable } from '@nestjs/common';
import { WappiLine } from '@prisma/client';
import { wappiBaseUrl } from '../common/utils';

type SendPayload = Record<string, string>;

@Injectable()
export class WappiService {
  private async post(
    line: WappiLine,
    path: string,
    payload: SendPayload,
  ) {
    const baseUrl = wappiBaseUrl(line.messengerType);
    const url = `${baseUrl}${path}?profile_id=${encodeURIComponent(line.wappiProfileId)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: line.wappiApiToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const raw = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(`Wappi send failed: ${response.status} ${JSON.stringify(raw)}`);
    }

    return {
      messageId: raw?.message_id ?? raw?.id ?? null,
      raw,
    };
  }

  async sendText(line: WappiLine, chatId: string, text: string) {
    return this.post(line, '/sync/message/send', {
      recipient: chatId,
      body: text,
    });
  }

  async sendDocument(
    line: WappiLine,
    chatId: string,
    fileBase64: string,
    fileName: string,
    caption?: string,
  ) {
    const payload: SendPayload = {
      recipient: chatId,
      chat_id: chatId,
      document_base64: fileBase64,
      body: fileBase64,
      file_name: fileName,
    };

    if (caption) {
      payload.caption = caption;
    }

    return this.post(line, '/sync/message/document/send', payload);
  }

  async sendFileUrl(
    line: WappiLine,
    chatId: string,
    fileUrl: string,
    caption?: string,
  ) {
    const payload: SendPayload = {
      recipient: chatId,
      chat_id: chatId,
      url: fileUrl,
    };

    if (caption) {
      payload.caption = caption;
    }

    return this.post(line, '/sync/message/file/url/send', payload);
  }

  extractChatId(payload: Record<string, unknown>): string | null {
    const chatId = payload.chatId ?? payload.chat_id;
    return typeof chatId === 'string' ? chatId : null;
  }

  extractBody(payload: Record<string, unknown>): string | null {
    const parsedType = typeof payload.type === 'string' ? payload.type : 'text';
    if (parsedType !== 'chat' && parsedType !== 'text') {
      if (typeof payload.caption === 'string') return payload.caption;
      if (typeof payload.file_name === 'string') return payload.file_name;
      return null;
    }

    const body = payload.body;
    if (typeof body === 'string' && !body.startsWith('/9j/') && body.length < 5000) {
      return body;
    }

    return null;
  }

  detectOutgoingType(mimeType: string, fileName: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (fileName.endsWith('.pdf') || mimeType.includes('pdf')) return 'document';
    return 'document';
  }
}
