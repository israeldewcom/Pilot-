import { Module, Global } from '@nestjs/common';
import { S3Service } from './s3.service';
import { TextExtractionService } from './text-extraction.service';

@Global()
@Module({
  providers: [S3Service, TextExtractionService],
  exports: [S3Service, TextExtractionService],
})
export class ToolsModule {}
