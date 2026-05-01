import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { AuthGuard, RolesGuard } from '../../common/guards/guards';
import { CurrentUser, RequestUser } from '../../common/decorators/decorators';

@ApiTags('Notifications')
@Controller('api/notifications')
@UseGuards(AuthGuard, RolesGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications for current user' })
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.notificationsService.findAll(user.id, user.organizationId, Number(page), Number(limit));
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  markRead(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.notificationsService.markRead(id, user.id);
  }

  @Post('mark-all-read')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser() user: RequestUser) {
    return this.notificationsService.markAllRead(user.id, user.organizationId);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive a notification' })
  archive(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.notificationsService.archive(id, user.id);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  getPreferences(@CurrentUser() user: RequestUser) {
    return this.notificationsService.getPreferences(user.id);
  }

  @Post('preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  updatePreferences(
    @CurrentUser() user: RequestUser,
    @Body() body: { prefs: Array<{ type: string; inApp: boolean; email: boolean }> },
  ) {
    return this.notificationsService.updatePreferences(user.id, body.prefs);
  }
}
