import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { isWappiHttpLogEnabled } from './wappi-http-log.utils';
import { WappiHttpFileLoggerService } from './wappi-http-file-logger.service';

/** Temporary public debug endpoints — disable/remove when done investigating. */
@Controller('api/logs/wappi')
export class WappiLogsController {
  constructor(private readonly wappiHttpFileLog: WappiHttpFileLoggerService) {}

  @Get()
  async list() {
    return {
      logDir: this.wappiHttpFileLog.getLogDir(),
      enabled: isWappiHttpLogEnabled(),
      files: await this.wappiHttpFileLog.listLogFiles(),
    };
  }

  @Get(':filename')
  async read(@Param('filename') filename: string, @Query('tail') tail?: string) {
    const tailNum = tail ? Number.parseInt(tail, 10) : undefined;
    try {
      return await this.wappiHttpFileLog.readLogFile(filename, { tail: tailNum });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('Log file not found');
      }
      if (err instanceof Error && err.message === 'Invalid log filename') {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
