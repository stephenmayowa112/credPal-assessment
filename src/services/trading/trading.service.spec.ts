import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Wallet } from '../../entities/wallet.entity';
import { WalletBalance } from '../../entities/wallet-balance.entity';
import { FxService } from '../fx/fx.service';
import { TransactionService } from '../transactions/transaction.service';
import { TradingService } from './trading.service';

describe('TradingService', () => {
  let service: TradingService;

  const mockWalletRepository = {
    findOne: jest.fn(),
  };

  const mockWalletBalanceRepository = {
    create: jest.fn(),
  };

  const mockFxService = {
    getRate: jest.fn(),
  };

  const mockTransactionService = {
    getIdempotencyResult: jest.fn(),
    storeIdempotencyResult: jest.fn(),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn(),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn(() => mockQueryRunner),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TradingService,
        {
          provide: getRepositoryToken(Wallet),
          useValue: mockWalletRepository,
        },
        {
          provide: getRepositoryToken(WalletBalance),
          useValue: mockWalletBalanceRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: FxService,
          useValue: mockFxService,
        },
        {
          provide: TransactionService,
          useValue: mockTransactionService,
        },
      ],
    }).compile();

    service = module.get<TradingService>(TradingService);
    jest.clearAllMocks();
  });

  it('should reject trade where neither side is NGN', async () => {
    await expect(
      service.trade('user-1', {
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        amount: 10,
        idempotencyKey: '1234567890123456',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject conversion with same source and target currency', async () => {
    await expect(
      service.convertCurrency('user-1', {
        sourceCurrency: 'NGN',
        targetCurrency: 'NGN',
        sourceAmount: 100,
        idempotencyKey: '1234567890123456',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should return idempotent conversion result when key already exists', async () => {
    mockTransactionService.getIdempotencyResult.mockReturnValue({
      transactionId: 'tx-1',
      sourceCurrency: 'NGN',
      targetCurrency: 'USD',
      sourceAmount: 100,
      targetAmount: 0.05,
      fxRate: 0.0005,
      timestamp: new Date(),
      status: 'SUCCESS',
    });

    const result = await service.convertCurrency('user-1', {
      sourceCurrency: 'NGN',
      targetCurrency: 'USD',
      sourceAmount: 100,
      idempotencyKey: '1234567890123456',
    });

    expect(result.transactionId).toBe('tx-1');
    expect(mockFxService.getRate).not.toHaveBeenCalled();
  });

  it('should throw insufficient balance when source funds are low', async () => {
    mockTransactionService.getIdempotencyResult.mockReturnValue(null);
    mockFxService.getRate.mockResolvedValue({
      from: 'NGN',
      to: 'USD',
      rate: 0.0006,
      timestamp: new Date().toISOString(),
      source: 'api',
    });

    mockQueryRunner.manager.findOne.mockResolvedValue({
      id: 'wallet-1',
      userId: 'user-1',
    });

    const sourceBalanceQuery = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        walletId: 'wallet-1',
        currency: 'NGN',
        balance: 50,
      }),
    };

    mockQueryRunner.manager.createQueryBuilder.mockReturnValue(sourceBalanceQuery);

    await expect(
      service.convertCurrency('user-1', {
        sourceCurrency: 'NGN',
        targetCurrency: 'USD',
        sourceAmount: 100,
        idempotencyKey: '1234567890123456',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
  });
});
