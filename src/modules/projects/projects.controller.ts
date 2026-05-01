import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProjectsService, CreateProjectDto, UpdateProjectDto, ProjectQueryDto } from './projects.service';
import { AuthGuard } from '../../common/guards/guards';
import { RolesGuard } from '../../common/guards/guards';
import { Roles } from '../../common/decorators/decorators';
import { CurrentUser, RequestUser } from '../../common/decorators/decorators';

@ApiTags('Projects')
@Controller('api/projects')
@UseGuards(AuthGuard, RolesGuard)
@ApiBearerAuth()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List all projects' })
  findAll(@CurrentUser() user: RequestUser, @Query() query: ProjectQueryDto) {
    return this.projectsService.findAll(user.organizationId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard stats' })
  getStats(@CurrentUser() user: RequestUser) {
    return this.projectsService.getDashboardStats(user.organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a project by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.projectsService.findOne(id, user.organizationId);
  }

  @Post()
  @Roles('editor', 'admin', 'owner')
  @ApiOperation({ summary: 'Create a new project' })
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: RequestUser) {
    return this.projectsService.create(dto, user.organizationId, user.id);
  }

  @Patch(':id')
  @Roles('editor', 'admin', 'owner')
  @ApiOperation({ summary: 'Update a project' })
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto, @CurrentUser() user: RequestUser) {
    return this.projectsService.update(id, dto, user.organizationId, user.id);
  }

  @Patch(':id/archive')
  @Roles('admin', 'owner')
  @ApiOperation({ summary: 'Archive a project' })
  archive(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.projectsService.archive(id, user.organizationId, user.id);
  }

  @Patch(':id/restore')
  @Roles('admin', 'owner')
  @ApiOperation({ summary: 'Restore archived project' })
  restore(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.projectsService.restore(id, user.organizationId, user.id);
  }

  @Delete(':id')
  @Roles('admin', 'owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a project' })
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.projectsService.softDelete(id, user.organizationId, user.id);
  }

  @Get(':id/outlines')
  @ApiOperation({ summary: 'Get project outlines/sections' })
  getOutlines(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.projectsService.getOutlines(id, user.organizationId);
  }

  @Patch(':projectId/outlines/:sectionId')
  @Roles('editor', 'admin', 'owner')
  @ApiOperation({ summary: 'Update a section content' })
  updateOutline(
    @Param('projectId') projectId: string,
    @Param('sectionId') sectionId: string,
    @Body('content') content: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.projectsService.updateOutline(projectId, sectionId, content, user.id, user.organizationId);
  }
}
