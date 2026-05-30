import { Injectable } from '@nestjs/common';
import { WappiLine } from '@prisma/client';
import { wappiBaseUrl } from '../common/utils';
import { isWappiHttpLogEnabled } from './wappi-http-log.utils';
import { WappiHttpFileLoggerService } from './wappi-http-file-logger.service';

type SendPayload = Record<string, string>;

@Injectable()
export class WappiService {
  constructor(private readonly httpFileLog: WappiHttpFileLoggerService) {}

  private async requestJson(
    line: WappiLine,
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string | number | boolean> = {},
    body?: SendPayload,
  ): Promise<unknown> {
    const baseUrl = wappiBaseUrl(line.messengerType);
    const searchParams = new URLSearchParams();
    searchParams.append('profile_id', line.wappiProfileId);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }

    const url = `${baseUrl}${path}?${searchParams.toString()}`;
    const started = Date.now();

    if (isWappiHttpLogEnabled()) {
      this.httpFileLog.logRequest(line, method, path, params, body);
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: line.wappiApiToken,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      const raw = await response.json().catch(() => ({}));
      const elapsedMs = Date.now() - started;

      if (!response.ok) {
        const errText = `${response.status} ${JSON.stringify(raw)}`;
        if (isWappiHttpLogEnabled()) {
          this.httpFileLog.logResponse(
            line,
            method,
            path,
            response.status,
            elapsedMs,
            raw,
            errText,
          );
        }
        throw new Error(`Wappi ${method} failed: ${errText}`);
      }

      if (isWappiHttpLogEnabled()) {
        this.httpFileLog.logResponse(line, method, path, response.status, elapsedMs, raw);
      }
      return raw;
    } catch (err) {
      const elapsedMs = Date.now() - started;
      if (
        isWappiHttpLogEnabled() &&
        err instanceof Error &&
        !err.message.startsWith('Wappi ')
      ) {
        this.httpFileLog.logResponse(line, method, path, 0, elapsedMs, null, err.message);
      }
      throw err;
    }
  }

  private async get(
    line: WappiLine,
    path: string,
    params: Record<string, string | number | boolean> = {},
  ) {
    return this.requestJson(line, 'GET', path, params);
  }

  private async postWithQuery(
    line: WappiLine,
    path: string,
    params: Record<string, string | number | boolean> = {},
  ) {
    return this.requestJson(line, 'POST', path, params);
  }

  private async post(
    line: WappiLine,
    path: string,
    payload: SendPayload,
  ) {
    const raw = (await this.requestJson(
      line,
      'POST',
      path,
      {},
      payload,
    )) as Record<string, unknown>;

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
    return this.postWithQuery(line, '/sync/chats/get', {
      limit,
      offset,
      show_all: showAll,
    });
  }

  async getContact(
    line: WappiLine,
    params: { recipient?: string; phone?: string },
  ) {
    const query: Record<string, string> = {};
    if (params.recipient) query.recipient = params.recipient;
    if (params.phone) query.phone = params.phone;
    if (!query.recipient && !query.phone) {
      throw new Error('Wappi getContact requires recipient or phone');
    }
    return this.get(line, '/sync/contact/get', query);
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
