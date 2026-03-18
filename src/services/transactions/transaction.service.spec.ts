import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../../entities/transaction.entity';
import { PaginationDto, TransactionFiltersDto } from '../../common/dto/transaction.dto';
import { TransactionService } from './transaction.service';

describe('TransactionService', () => {
  let service: TransactionService;
  let repository: Repository<Transaction>;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
    repository = module.get<Repository<Transaction>>(getRepositoryToken(Transaction));

    jest.clearAllMocks();
  });

  it('should create and save a transaction', async () => {
    const input = {
      userId: 'user-1',
      type: 'FUNDING' as const,
      sourceCurrency: 'NGN',
      targetCurrency: 'NGN',
      sourceAmount: 1000,
      targetAmount: 1000,
      fxRate: 1,
      idempotencyKey: '1234567890123456',
    };

    mockRepository.create.mockReturnValue(input);
    mockRepository.save.mockResolvedValue({ id: 'tx-1', ...input });

    const result = await service.createTransaction(input);

    expect(mockRepository.create).toHaveBeenCalledWith(expect.objectContaining(input));
    expect(mockRepository.save).toHaveBeenCalled();
    expect(result.id).toBe('tx-1');
  });

  it('should store and retrieve idempotency results', () => {
    service.storeIdempotencyResult('idem-key', { ok: true });

    const result = service.getIdempotencyResult('idem-key');

    expect(result).toEqual({ ok: true });
  });

  it('should return null when idempotency result is expired', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1000);
    service.storeIdempotencyResult('expired-key', { ok: true });

    nowSpy.mockReturnValue(1000 + 24 * 60 * 60 * 1000 + 1);
    const result = service.getIdempotencyResult('expired-key');

    expect(result).toBeNull();
    nowSpy.mockRestore();
  });

  it('should return paginated transaction history', async () => {
    mockQueryBuilder.getManyAndCount.mockResolvedValue([
      [{ id: 'tx-1' }, { id: 'tx-2' }],
      2,
    ]);

    const filters: TransactionFiltersDto = {
      type: undefined,
      currency: undefined,
      startDate: undefined,
      endDate: undefined,
    };
    const pagination: PaginationDto = {
      page: 1,
      limit: 20,
    };

    const result = await service.getTransactionHistory('user-1', filters, pagination);

    expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('transaction');
    expect(result.data.length).toBe(2);
    expect(result.meta.total).toBe(2);
    expect(result.meta.totalPages).toBe(1);
  });

  it('should throw not found when transaction does not exist', async () => {
    mockRepository.findOne.mockResolvedValue(null);

    await expect(service.getTransactionById('user-1', 'tx-1')).rejects.toThrow(NotFoundException);
  });

  it('should throw forbidden when transaction belongs to another user', async () => {
    mockRepository.findOne.mockResolvedValue({
      id: 'tx-1',
      userId: 'other-user',
    });

    await expect(service.getTransactionById('user-1', 'tx-1')).rejects.toThrow(ForbiddenException);
  });

  it('should return transaction when owner matches', async () => {
    mockRepository.findOne.mockResolvedValue({
      id: 'tx-1',
      userId: 'user-1',
    });

    const result = await service.getTransactionById('user-1', 'tx-1');

    expect(result.id).toBe('tx-1');
  });
});
