import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../../entities/transaction.entity';
import {
  PaginationDto,
  TransactionFiltersDto,
} from '../../common/dto/transaction.dto';
import { CacheService } from '../cache/cache.service';

export interface CreateTransactionInput {
  userId: string;
  type: 'FUNDING' | 'CONVERSION' | 'TRADE';
  sourceCurrency?: string;
  targetCurrency?: string;
  sourceAmount?: number;
  targetAmount?: number;
  fxRate?: number;
  status?: 'SUCCESS' | 'FAILED';
  idempotencyKey?: string;
}

@Injectable()
export class TransactionService {
  private readonly IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly cacheService: CacheService,
  ) {}

  async createTransaction(input: CreateTransactionInput): Promise<Transaction> {
    const transaction = this.transactionRepository.create({
      ...input,
      status: input.status ?? 'SUCCESS',
    });

    return this.transactionRepository.save(transaction);
  }

  async storeIdempotencyResult(key: string, result: unknown): Promise<void> {
    await this.cacheService.setJson(
      `idempotency:${key}`,
      result,
      this.IDEMPOTENCY_TTL_SECONDS,
    );
  }

  async getIdempotencyResult<T = unknown>(key: string): Promise<T | null> {
    return this.cacheService.getJson<T>(`idempotency:${key}`);
  }

  async getTransactionHistory(
    userId: string,
    filters: TransactionFiltersDto,
    pagination: PaginationDto,
  ): Promise<{
    data: Transaction[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    const query = this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId });

    if (filters.type) {
      query.andWhere('transaction.type = :type', { type: filters.type });
    }

    if (filters.currency) {
      query.andWhere(
        '(transaction.sourceCurrency = :currency OR transaction.targetCurrency = :currency)',
        { currency: filters.currency },
      );
    }

    if (filters.startDate) {
      query.andWhere('transaction.createdAt >= :startDate', {
        startDate: new Date(filters.startDate),
      });
    }

    if (filters.endDate) {
      query.andWhere('transaction.createdAt <= :endDate', {
        endDate: new Date(filters.endDate),
      });
    }

    query.orderBy('transaction.createdAt', 'DESC');
    query.skip((page - 1) * limit).take(limit);

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTransactionById(userId: string, transactionId: string): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.userId !== userId) {
      throw new ForbiddenException('You cannot access this transaction');
    }

    return transaction;
  }
}
