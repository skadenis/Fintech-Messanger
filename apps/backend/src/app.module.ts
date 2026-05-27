import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BitrixModule } from './bitrix/bitrix.module';
import { ConversationsModule } from './conversations/conversations.module';
import { GatewayModule } from './gateway/gateway.module';
import { LinesModule } from './lines/lines.module';
import { MessagesModule } from './messages/messages.module';
import { PrismaModule } from './prisma/prisma.module';
import { WappiModule } from './wappi/wappi.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    PrismaModule,
    AuthModule,
    LinesModule,
    ConversationsModule,
    MessagesModule,
    WappiModule,
    BitrixModule,
    AdminModule,
    GatewayModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
