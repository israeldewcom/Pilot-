import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client, PutObjectCommand, GetObjectCommand,
  DeleteObjectCommand, HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly cdnUrl: string | null;

  constructor(private configService: ConfigService) {
    this.bucket = this.configService.get('S3_BUCKET');
    this.cdnUrl = this.configService.get('S3_CDN_URL') || null;
    this.s3 = new S3Client({
      endpoint: this.configService.get('S3_ENDPOINT'),
      region: this.configService.get('S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get('S3_ACCESS_KEY'),
        secretAccessKey: this.configService.get('S3_SECRET_KEY'),
      },
      forcePathStyle: this.configService.get('S3_USE_PATH_STYLE') === 'true',
    });
  }

  async uploadFile(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    organizationId: string,
  ): Promise<{ key: string; url: string; sizeBytes: number; cdnUrl?: string }> {
    const ext = filename.split('.').pop();
    const key = `documents/${organizationId}/${uuidv4()}.${ext}`;

    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      Metadata: { organizationId, originalFilename: filename },
    }));

    const s3Url = `${this.configService.get('S3_ENDPOINT')}/${this.bucket}/${key}`;
    let cdnUrl = null;
    if (this.cdnUrl) {
      cdnUrl = `${this.cdnUrl}/${key}`;
    }
    return { key, url: cdnUrl || s3Url, sizeBytes: buffer.length, cdnUrl: cdnUrl ?? undefined };
  }

  async getPresignedUploadUrl(
    filename: string,
    contentType: string,
    organizationId: string,
  ): Promise<{ uploadUrl: string; key: string }> {
    const ext = filename.split('.').pop();
    const key = `documents/${organizationId}/${uuidv4()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      Metadata: { organizationId, originalFilename: filename },
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 });
    return { uploadUrl, key };
  }

  async getPresignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn });
  }

  async getFileBuffer(key: string): Promise<Buffer> {
    const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async deleteFile(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}
