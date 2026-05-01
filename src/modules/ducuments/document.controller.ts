import {
  Controller, Get, Post, Delete, Param, Body, UseGuards,
  UseInterceptors, UploadedFile, UsePipes, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentsService } from './documents.service';
import { AuthGuard, RolesGuard, OrgRateLimitGuard } from '../../common/guards/guards';
import { Roles, CurrentUser, RequestUser } from '../../common/decorators/decorators';
import { FileValidationPipe } from '../../common/decorators/file-validation.decorator';

@ApiTags('Documents')
@Controller('api/documents')
@UseGuards(AuthGuard, RolesGuard, OrgRateLimitGuard)
@ApiBearerAuth()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('project/:projectId')
  @ApiOperation({ summary: 'Get all documents for a project' })
  findAll(@Param('projectId') projectId: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.findAll(projectId, user.organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a document by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.findOne(id, user.organizationId);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Get presigned download URL' })
  getDownloadUrl(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.getDownloadUrl(id, user.organizationId);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get document indexing status' })
  getStatus(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.getIndexingStatus(id, user.organizationId);
  }

  @Post('upload/:projectId')
  @Roles('editor', 'admin', 'owner')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload and index a document' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }))
  upload(
    @UploadedFile(FileValidationPipe) file: Express.Multer.File,
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.uploadDocument(file, projectId, user.organizationId, user.id);
  }

  @Post('presign/:projectId')
  @Roles('editor', 'admin', 'owner')
  @ApiOperation({ summary: 'Get presigned S3 URL for direct upload' })
  presign(
    @Param('projectId') projectId: string,
    @Body() body: { filename: string; contentType: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.getPresignedUpload(body.filename, body.contentType, projectId, user.organizationId, user.id);
  }

  @Post(':id/process')
  @Roles('editor', 'admin', 'owner')
  @ApiOperation({ summary: 'Trigger processing for a pre-uploaded document' })
  process(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.processAfterUpload(id, user.organizationId);
  }

  @Delete(':id')
  @Roles('admin', 'owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a document' })
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.delete(id, user.organizationId);
  }
}
