import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

interface MemoryCacheEntry {
  value: string;
  expiresAt: number;
}

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redisClient: RedisClientType | null = null;
  private readonly memoryFallback = new Map<string, MemoryCacheEntry>();

  async onModuleInit(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not set. Using in-memory cache fallback.');
      return;
    }

    try {
      this.redisClient = createClient({ url: redisUrl });
      this.redisClient.on('error', (error) => {
        this.logger.warn(`Redis error, using fallback cache: ${error.message}`);
      });
      await this.redisClient.connect();
      this.logger.log('Redis cache connected');
    } catch (error) {
      this.logger.warn('Failed to connect to Redis. Using in-memory cache fallback.');
      this.redisClient = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisClient?.isOpen) {
      await this.redisClient.quit();
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const redisValue = await this.get(key);
    if (!redisValue) {
      return null;
    }

    try {
      return JSON.parse(redisValue) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  async get(key: string): Promise<string | null> {
    if (this.redisClient?.isOpen) {
      try {
        return await this.redisClient.get(key);
      } catch {
        // ignore redis errors and fallback to memory
      }
    }

    const fallbackValue = this.memoryFallback.get(key);
    if (!fallbackValue) {
      return null;
    }

    if (Date.now() > fallbackValue.expiresAt) {
      this.memoryFallback.delete(key);
      return null;
    }

    return fallbackValue.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.redisClient?.isOpen) {
      try {
        await this.redisClient.set(key, value, {
          EX: ttlSeconds,
        });
      } catch {
        // continue to fallback
      }
    }

    this.memoryFallback.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }
}
