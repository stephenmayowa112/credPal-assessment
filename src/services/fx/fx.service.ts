import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios from 'axios';
import { CacheService } from '../cache/cache.service';

interface RateCacheItem {
  rate: number;
  timestamp: string;
}

@Injectable()
export class FxService {
  private readonly SUPPORTED_CURRENCIES = [
    'NGN',
    'USD',
    'EUR',
    'GBP',
    'CAD',
    'AUD',
    'JPY',
  ];
  private readonly CACHE_TTL_SECONDS = 5 * 60;

  constructor(private readonly cacheService: CacheService) {}

  async getRate(from: string, to: string): Promise<{
    from: string;
    to: string;
    rate: number;
    timestamp: string;
    source: 'cache' | 'api';
  }> {
    const source = from.toUpperCase();
    const target = to.toUpperCase();

    if (!this.SUPPORTED_CURRENCIES.includes(source) || !this.SUPPORTED_CURRENCIES.includes(target)) {
      throw new BadRequestException('Unsupported currency pair');
    }

    if (source === target) {
      return {
        from: source,
        to: target,
        rate: 1,
        timestamp: new Date().toISOString(),
        source: 'api',
      };
    }

    const key = `fx_rate:${source}:${target}`;
    const cached = await this.cacheService.getJson<RateCacheItem>(key);
    if (cached) {
      return {
        from: source,
        to: target,
        rate: cached.rate,
        timestamp: cached.timestamp,
        source: 'cache',
      };
    }

    const response = await this.fetchFromAPI(source, target);

    await this.cacheService.setJson(
      key,
      {
        rate: response.rate,
        timestamp: response.timestamp,
      },
      this.CACHE_TTL_SECONDS,
    );

    return {
      from: source,
      to: target,
      rate: response.rate,
      timestamp: response.timestamp,
      source: 'api',
    };
  }

  async getAllRates(base = 'NGN'): Promise<Array<{ to: string; rate: number; timestamp: string }>> {
    const normalizedBase = base.toUpperCase();
    if (!this.SUPPORTED_CURRENCIES.includes(normalizedBase)) {
      throw new BadRequestException('Unsupported base currency');
    }

    const rates = await Promise.all(
      this.SUPPORTED_CURRENCIES.filter((currency) => currency !== normalizedBase).map(async (currency) => {
        const result = await this.getRate(normalizedBase, currency);
        return {
          to: currency,
          rate: result.rate,
          timestamp: result.timestamp,
        };
      }),
    );

    return rates;
  }

  private async fetchFromAPI(
    from: string,
    to: string,
  ): Promise<{ rate: number; timestamp: string }> {
    const apiUrl = process.env.FX_API_URL || 'https://open.er-api.com/v6/latest';
    const delays = [1000, 2000, 4000];

    for (let attempt = 0; attempt < delays.length; attempt++) {
      try {
        const { data } = await axios.get(`${apiUrl}/${from}`, {
          timeout: 5000,
        });

        const rate = Number(data?.rates?.[to]);
        if (!rate || Number.isNaN(rate) || rate <= 0) {
          throw new Error('Invalid FX rate returned from provider');
        }

        return {
          rate,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        if (attempt === delays.length - 1) {
          throw new ServiceUnavailableException('Unable to fetch FX rates at this time');
        }

        await this.delay(delays[attempt]);
      }
    }

    throw new ServiceUnavailableException('Unable to fetch FX rates at this time');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
