import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AdminLoginRequest, IframeAuthRequest } from '@fintech/shared';
import { JwtAuthGuard, JwtPayload } from '../common/guards';
import { AuthService } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('iframe')
  iframeAuth(@Body() dto: IframeAuthRequest) {
    return this.authService.iframeAuth(dto);
  }

  @Post('login')
  adminLogin(@Body() dto: AdminLoginRequest) {
    return this.authService.adminLogin(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: { user: JwtPayload }) {
    return this.authService.getProfile(req.user.sub);
  }
}
