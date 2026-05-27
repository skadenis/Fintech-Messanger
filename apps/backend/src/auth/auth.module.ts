import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessService } from '../common/access.service';
import { BitrixModule } from '../bitrix/bitrix.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'change-me-in-production',
      signOptions: { expiresIn: '12h' },
    }),
    forwardRef(() => BitrixModule),
  ],
  controllers: [AuthController],
  providers: [AuthService, AccessService],
  exports: [AuthService, AccessService],
})
export class AuthModule {}
