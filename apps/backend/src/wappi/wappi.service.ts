import { Injectable } from '@nestjs/common';
import { WappiLine } from '@prisma/client';
import { wappiBaseUrl } from '../common/utils';

type SendPayload = Record<string, string>;

@Injectable()
export class WappiService {
  private async get(
    line: WappiLine,
    path: string,
    params: Record<string, string | number | boolean> = {},
  ) {
    const baseUrl = wappiBaseUrl(line.messengerType);
    const searchParams = new URLSearchParams();
    searchParams.append('profile_id', line.wappiProfileId);
    
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }

    const url = `${baseUrl}${path}?${searchParams.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: line.wappiApiToken,
      },
    });

    const raw = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(`Wappi get failed: ${response.status} ${JSON.stringify(raw)}`);
    }

    return raw;
  }

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

  async getChats(line: WappiLine, limit = 200, offset = 0, showAll = false) {
    if (line.messengerType === 'TELEGRAM') {
      return this.get(line, '/sync/chats/get', {
        limit,
        offset,
        show_all: showAll,
      });
    }
    if (line.messengerType === 'MAX') {
      return this.get(line, '/sync/chats/get', {
        limit,
        offset,
        show_all: showAll,
      });
    }
    return this.post(line, '/sync/chats/get', {
      limit: String(limit),
      offset: String(offset),
      show_all: String(showAll),
    });
  }

  async getMessages(line: WappiLine, chatId: string, limit = 100, offset = 0) {
    if (line.messengerType === 'TELEGRAM') {
      return this.get(line, '/sync/messages/get', {
        chat_id: chatId,
        limit,
        offset,
      });
    }
    if (line.messengerType === 'MAX') {
      return this.get(line, '/sync/messages/get', {
        chat_id: chatId,
        limit,
        offset,
      });
    }
    return this.get(line, '/sync/messages/get', {
      chat_id: chatId,
      limit,
      offset,
    });
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
