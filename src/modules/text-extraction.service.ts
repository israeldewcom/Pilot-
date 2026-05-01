import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TextExtractionService {
  private readonly logger = new Logger(TextExtractionService.name);

  constructor(private configService: ConfigService) {}

  async extractText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
    const tikaUrl = this.configService.get('TIKA_URL');
    if (tikaUrl) {
      try {
        return await this.extractWithTika(buffer, mimeType, tikaUrl);
      } catch (err) {
        this.logger.warn(`Tika extraction failed: ${err.message}. Falling back.`);
      }
    }

    const unstructuredApiKey = this.configService.get('UNSTRUCTURED_API_KEY');
    if (unstructuredApiKey) {
      try {
        return await this.extractWithUnstructured(buffer, filename, unstructuredApiKey);
      } catch (err) {
        this.logger.warn(`Unstructured extraction failed: ${err.message}. Using raw text fallback.`);
      }
    }

    return buffer.toString('utf-8').replace(/\x00/g, '').trim();
  }

  private async extractWithTika(buffer: Buffer, mimeType: string, tikaUrl: string): Promise<string> {
    const response = await fetch(`${tikaUrl}/tika`, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'Accept': 'text/plain',
      },
      body: buffer,
    });

    if (!response.ok) throw new Error(`Tika error: ${response.status}`);
    const text = await response.text();
    return this.cleanText(text);
  }

  private async extractWithUnstructured(buffer: Buffer, filename: string, apiKey: string): Promise<string> {
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    formData.append('files', blob, filename);
    formData.append('strategy', 'auto');
    formData.append('output_format', 'text/plain');

    const response = await fetch('https://api.unstructured.io/general/v0/general', {
      method: 'POST',
      headers: { 'unstructured-api-key': apiKey },
      body: formData,
    });

    if (!response.ok) throw new Error(`Unstructured error: ${response.status}`);
    const data = await response.json();
    const text = data.map((el: any) => el.text || '').join('\n\n');
    return this.cleanText(text);
  }

  private cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\t/g, '  ')
      .replace(/\x00/g, '')
      .trim();
  }

  chunkText(text: string, chunkSize: number = 512, overlap: number = 64): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let i = 0;

    while (i < words.length) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      if (chunk.trim()) chunks.push(chunk.trim());
      i += chunkSize - overlap;
    }

    return chunks;
  }
}
