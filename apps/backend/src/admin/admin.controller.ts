import { Body, Controller, Get, Param, Post, Put, Delete, Req, UseGuards } from '@nestjs/common';
import {
  AssignLinesRequest,
  CreateGroupRequest,
  UpdateGroupRequest,
  CreateLineRequest,
  UpdateLineRequest,
  CreateUserRequest,
  UpdateUserRequest,
  Role,
} from '@fintech/shared';
import { JwtAuthGuard, JwtPayload, Roles, RolesGuard } from '../common/guards';
import { AdminService } from './admin.service';

@Controller('api/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('groups')
  listGroups(@Req() req: { user: JwtPayload }) {
    return this.adminService.listGroups(req.user);
  }

  @Post('groups')
  @Roles(Role.SUPER_ADMIN)
  createGroup(@Req() req: { user: JwtPayload }, @Body() dto: CreateGroupRequest) {
    return this.adminService.createGroup(req.user, dto);
  }

  @Put('groups/:id')
  @Roles(Role.SUPER_ADMIN)
  updateGroup(
    @Req() req: { user: JwtPayload },
    @Param('id') id: string,
    @Body() dto: UpdateGroupRequest,
  ) {
    return this.adminService.updateGroup(req.user, id, dto);
  }

  @Delete('groups/:id')
  @Roles(Role.SUPER_ADMIN)
  deleteGroup(@Req() req: { user: JwtPayload }, @Param('id') id: string) {
    return this.adminService.deleteGroup(req.user, id);
  }

  @Delete('groups/:groupId/users/:userId')
  @Roles(Role.SUPER_ADMIN)
  removeUserFromGroup(
    @Req() req: { user: JwtPayload },
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
  ) {
    return this.adminService.removeUserFromGroup(req.user, groupId, userId);
  }

  @Get('users')
  listUsers(@Req() req: { user: JwtPayload }) {
    return this.adminService.listUsers(req.user);
  }

  @Post('users')
  createUser(@Req() req: { user: JwtPayload }, @Body() dto: CreateUserRequest) {
    return this.adminService.createUser(req.user, dto);
  }

  @Put('users/:id')
  updateUser(
    @Req() req: { user: JwtPayload },
    @Param('id') id: string,
    @Body() dto: UpdateUserRequest,
  ) {
    return this.adminService.updateUser(req.user, id, dto);
  }

  @Delete('users/:id')
  deleteUser(@Req() req: { user: JwtPayload }, @Param('id') id: string) {
    return this.adminService.deleteUser(req.user, id);
  }

  @Post('users/:id/assign-lines')
  assignLines(
    @Req() req: { user: JwtPayload },
    @Param('id') id: string,
    @Body() dto: AssignLinesRequest,
  ) {
    return this.adminService.assignLines(req.user, id, dto);
  }

  @Get('lines')
  listLines(@Req() req: { user: JwtPayload }) {
    return this.adminService.listLines(req.user);
  }

  @Post('lines')
  createLine(@Req() req: { user: JwtPayload }, @Body() dto: CreateLineRequest) {
    return this.adminService.createLine(req.user, dto);
  }

  @Put('lines/:id')
  updateLine(
    @Req() req: { user: JwtPayload },
    @Param('id') id: string,
    @Body() dto: UpdateLineRequest,
  ) {
    return this.adminService.updateLine(req.user, id, dto);
  }

  @Delete('lines/:id')
  deleteLine(@Req() req: { user: JwtPayload }, @Param('id') id: string) {
    return this.adminService.deleteLine(req.user, id);
  }

  @Post('lines/:id/sync-history')
  @Roles(Role.SUPER_ADMIN)
  syncLineHistory(@Req() req: { user: JwtPayload }, @Param('id') id: string) {
    return this.adminService.syncLineHistory(req.user, id);
  }

  @Post('bitrix/sync-users')
  @Roles(Role.SUPER_ADMIN)
  syncBitrixUsers(@Req() req: { user: JwtPayload }) {
    return this.adminService.syncBitrixUsers(req.user);
  }
}
