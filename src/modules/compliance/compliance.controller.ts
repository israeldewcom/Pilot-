import {
  Controller, Get, Post, Patch, Param, Body, UseGuards, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ComplianceService } from './compliance.service';
import { AuthGuard, RolesGuard } from '../../common/guards/guards';
import { Roles, CurrentUser, RequestUser } from '../../common/decorators/decorators';

@ApiTags('Compliance')
@Controller('api/compliance')
@UseGuards(AuthGuard, RolesGuard)
@ApiBearerAuth()
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get('projects/:projectId/summary')
  @ApiOperation({ summary: 'Get compliance summary for a project' })
  getSummary(@Param('projectId') projectId: string) {
    return this.complianceService.getComplianceSummary(projectId);
  }

  @Post('projects/:projectId/scan')
  @Roles('editor', 'admin', 'owner')
  @ApiOperation({ summary: 'Trigger compliance scan' })
  triggerScan(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.complianceService.triggerScan(projectId, user.organizationId);
  }

  @Post('projects/:projectId/extract-requirements')
  @Roles('editor', 'admin', 'owner')
  @ApiOperation({ summary: 'AI-extract requirements from RFP text' })
  extractRequirements(
    @Param('projectId') projectId: string,
    @Body('rfpText') rfpText: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.complianceService.extractRequirementsFromRfp(projectId, rfpText, user.id);
  }

  @Post(':requirementId/auto-fix')
  @Roles('editor', 'admin', 'owner')
  @ApiOperation({ summary: 'Queue AI auto-fix for a single gap' })
  autoFix(
    @Param('requirementId') requirementId: string,
    @Body('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.complianceService.autoFixGap(requirementId, projectId, user.id);
  }

  @Post('projects/:projectId/auto-fix-all')
  @Roles('editor', 'admin', 'owner')
  @ApiOperation({ summary: 'Queue AI auto-fix for all missing requirements' })
  autoFixAll(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.complianceService.autoFixAll(projectId, user.id);
  }

  @Patch(':requirementId/status')
  @Roles('editor', 'admin', 'owner')
  @ApiOperation({ summary: 'Manually update requirement status' })
  updateStatus(
    @Param('requirementId') requirementId: string,
    @Body() body: { status: string; evidence?: string },
  ) {
    return this.complianceService.updateRequirementStatus(requirementId, body.status, body.evidence);
  }
}
