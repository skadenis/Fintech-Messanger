import { Injectable, Logger } from '@nestjs/common';
import { WappiLine } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { wappiBaseUrl } from '../common/utils';
import {
  buildWappiLogResponseBody,
  isWappiHttpLogEnabled,
  redactForLog,
} from './wappi-http-log.utils';

export type WappiLogKind = 'request' | 'response' | 'sync_phone';

export interface WappiHttpLogEntry {
  at: string;
  kind: WappiLogKind;
  line: {
    id: string;
    name: string;
    messengerType: string;
    profileId: string;
  };
  wappi?: {
    method: string;
    path: string;
    baseUrl?: string;
    url?: string;
    queryParams?: Record<string, string>;
    body?: unknown;
  };
  response?: {
    httpStatus: number;
    elapsedMs: number;
    body?: unknown;
    error?: string;
  };
  syncPhone?: Record<string, unknown>;
}

const LOG_FILE_RE = /^(wappi|sync-phone)-\d{4}-\d{2}-\d{2}\.jsonl$/;

@Injectable()
export class WappiHttpFileLoggerService {
  private readonly logger = new Logger(WappiHttpFileLoggerService.name);
  private writeChain: Promise<void> = Promise.resolve();

  getLogDir(): string {
    return process.env.WAPPI_LOG_DIR?.trim() || '/var/log/fintech-messenger/wappi';
  }

  private todaySuffix(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private fileForKind(kind: WappiLogKind): string {
    const prefix = kind === 'sync_phone' ? 'sync-phone' : 'wappi';
    return `${prefix}-${this.todaySuffix()}.jsonl`;
  }

  private enqueueWrite(filePath: string, line: string): void {
    this.writeChain = this.writeChain
      .then(async () => {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.appendFile(filePath, line, 'utf8');
      })
      .catch((err) => {
        this.logger.error(`Failed to write Wappi log ${filePath}: ${err}`);
      });
  }

  private append(entry: WappiHttpLogEntry, kind: WappiLogKind): void {
    if (!isWappiHttpLogEnabled()) return;
    const filePath = path.join(this.getLogDir(), this.fileForKind(kind));
    this.enqueueWrite(filePath, `${JSON.stringify(entry)}\n`);
  }

  logRequest(
    line: WappiLine,
    method: string,
    path: string,
    params: Record<string, string | number | boolean>,
    body?: Record<string, unknown>,
  ): void {
    const baseUrl = wappiBaseUrl(line.messengerType);
    const searchParams = new URLSearchParams();
    searchParams.append('profile_id', line.wappiProfileId);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }

    const entry: WappiHttpLogEntry = {
      at: new Date().toISOString(),
      kind: 'request',
      line: {
        id: line.id,
        name: line.name,
        messengerType: line.messengerType,
        profileId: line.wappiProfileId,
      },
      wappi: {
        method,
        path,
        baseUrl,
        url: `${baseUrl}${path}?${searchParams.toString()}`,
        queryParams: Object.fromEntries(searchParams.entries()),
        ...(body ? { body: redactForLog(body) } : {}),
      },
    };

    this.append(entry, 'request');
  }

  logResponse(
    line: WappiLine,
    method: string,
    path: string,
    httpStatus: number,
    elapsedMs: number,
    raw: unknown,
    error?: string,
  ): void {
    const entry: WappiHttpLogEntry = {
      at: new Date().toISOString(),
      kind: 'response',
      line: {
        id: line.id,
        name: line.name,
        messengerType: line.messengerType,
        profileId: line.wappiProfileId,
      },
      wappi: { method, path, baseUrl: wappiBaseUrl(line.messengerType) },
      response: {
        httpStatus,
        elapsedMs,
        ...(error
          ? { error, body: redactForLog(raw) }
          : { body: buildWappiLogResponseBody(path, raw, httpStatus) }),
      },
    };

    this.append(entry, 'response');
  }

  logSyncPhone(line: WappiLine, chatId: string, details: Record<string, unknown>): void {
    const entry: WappiHttpLogEntry = {
      at: new Date().toISOString(),
      kind: 'sync_phone',
      line: {
        id: line.id,
        name: line.name,
        messengerType: line.messengerType,
        profileId: line.wappiProfileId,
      },
      syncPhone: { chatId, ...redactForLog(details) as Record<string, unknown> },
    };
    this.append(entry, 'sync_phone');
  }

  assertSafeFilename(filename: string): void {
    if (!LOG_FILE_RE.test(filename)) {
      throw new Error('Invalid log filename');
    }
  }

  async listLogFiles(): Promise<
    Array<{ name: string; kind: string; sizeBytes: number; updatedAt: string }>
  > {
    const dir = this.getLogDir();
    try {
      const names = await fs.readdir(dir);
      const files = names.filter((n) => LOG_FILE_RE.test(n));
      const stats = await Promise.all(
        files.map(async (name) => {
          const stat = await fs.stat(path.join(dir, name));
          return {
            name,
            kind: name.startsWith('sync-phone') ? 'sync_phone' : 'wappi_http',
            sizeBytes: stat.size,
            updatedAt: stat.mtime.toISOString(),
          };
        }),
      );
      return stats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  async readLogFile(
    filename: string,
    options: { tail?: number } = {},
  ): Promise<{ filename: string; lines: WappiHttpLogEntry[]; truncated: boolean }> {
    this.assertSafeFilename(filename);
    const filePath = path.join(this.getLogDir(), filename);
    const raw = await fs.readFile(filePath, 'utf8');
    const allLines = raw.split('\n').filter(Boolean);
    const tail = Math.min(Math.max(options.tail ?? 200, 1), 5000);
    const slice = allLines.length > tail ? allLines.slice(-tail) : allLines;

    const lines: WappiHttpLogEntry[] = [];
    for (const line of slice) {
      try {
        lines.push(JSON.parse(line) as WappiHttpLogEntry);
      } catch {
        lines.push({
          at: new Date().toISOString(),
          kind: 'response',
          line: { id: '', name: '', messengerType: '', profileId: '' },
          response: { httpStatus: 0, elapsedMs: 0, error: 'parse_error', body: line },
        });
      }
    }

    return {
      filename,
      lines,
      truncated: allLines.length > tail,
    };
  }
}
