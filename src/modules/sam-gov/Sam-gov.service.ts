import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SamOpportunity } from '../../entities/entities';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class SamGovService {
  private readonly logger = new Logger(SamGovService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    private configService: ConfigService,
    @InjectRepository(SamOpportunity) private samRepo: Repository<SamOpportunity>,
    private eventEmitter: EventEmitter2,
  ) {
    this.apiKey = configService.get('SAM_GOV_API_KEY') || '';
    this.baseUrl = configService.get('SAM_GOV_BASE_URL', 'https://api.sam.gov/opportunities/v2');
  }

  async searchOpportunities(keywords: string[], naicsCode?: string): Promise<any> {
    if (!this.apiKey) throw new Error('SAM.gov API key not configured');
    const params = new URLSearchParams({ api_key: this.apiKey, limit: '25' });
    if (keywords.length) params.append('keywords', keywords.join(','));
    if (naicsCode) params.append('naicsCode', naicsCode);
    const url = `${this.baseUrl}/search?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`SAM.gov API error: ${response.status}`);
    return response.json();
  }

  async importOpportunity(noticeId: string, organizationId: string, userId: string): Promise<any> {
    if (!this.apiKey) throw new Error('SAM.gov API key not configured');
    const response = await fetch(`${this.baseUrl}/${noticeId}?api_key=${this.apiKey}`);
    const opp = await response.json();

    const sam = await this.samRepo.save({
      noticeId: opp.noticeId,
      title: opp.title,
      description: opp.description,
      agency: opp.agency,
      naicsCode: opp.naicsCode,
      postedDate: opp.postedDate,
      responseDeadline: opp.responseDeadline,
      setAside: opp.setAside,
      url: opp.uiLink,
    });

    if (organizationId) {
      this.eventEmitter.emit('sam.opportunity.import', {
        opportunity: sam,
        organizationId,
        userId,
      });
    }
    return sam;
  }
}
