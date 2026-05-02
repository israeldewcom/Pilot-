import { BadRequestException, PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/vnd.oasis.opendocument.text',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

@Injectable()
export class FileValidationPipe implements PipeTransform {
  transform(value: Express.Multer.File, metadata: ArgumentMetadata) {
    if (!value) throw new BadRequestException('File is required');
    if (!ALLOWED_MIME_TYPES.includes(value.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${value.mimetype}`);
    }
    if (value.size > MAX_FILE_SIZE) {
      throw new BadRequestException(`File size exceeds the maximum allowed (${MAX_FILE_SIZE / 1024 / 1024}MB)`);
    }
    return value;
  }
}
