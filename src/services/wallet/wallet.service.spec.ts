import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Wallet } from '../../entities/wallet.entity';
import { WalletBalance } from '../../entities/wallet-balance.entity';
import { TransactionService } from '../transactions/transaction.service';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  let service: WalletService;
  let walletRepository: Repository<Wallet>;

  const mockWalletRepository = {
    findOne: jest.fn(),
  };

  const mockWalletBalanceRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
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
        WalletService,
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
          provide: TransactionService,
          useValue: mockTransactionService,
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
    walletRepository = module.get<Repository<Wallet>>(getRepositoryToken(Wallet));

    jest.clearAllMocks();
  });

  it('should throw when wallet does not exist on getBalances', async () => {
    mockWalletRepository.findOne.mockResolvedValue(null);

    await expect(service.getBalances('user-1')).rejects.toThrow(BadRequestException);
  });

  it('should return normalized balances', async () => {
    mockWalletRepository.findOne.mockResolvedValue({
      id: 'wallet-1',
      balances: [
        { currency: 'NGN', balance: 1000.1 },
        { currency: 'USD', balance: 2 },
      ],
    });

    const result = await service.getBalances('user-1');

    expect(result).toEqual([
      { currency: 'NGN', balance: 1000.1 },
      { currency: 'USD', balance: 2 },
    ]);
  });

  it('should return idempotent result without processing funding', async () => {
    mockTransactionService.getIdempotencyResult.mockResolvedValue({ ok: true });

    const result = await service.fundWallet('user-1', {
      amount: 100,
      idempotencyKey: '1234567890123456',
    });

    expect(result).toEqual({ ok: true });
    expect(mockDataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('should throw for invalid funding amount', async () => {
    mockTransactionService.getIdempotencyResult.mockResolvedValue(null);

    await expect(
      service.fundWallet('user-1', {
        amount: 0,
        idempotencyKey: '1234567890123456',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should perform funding transaction successfully', async () => {
    mockTransactionService.getIdempotencyResult.mockResolvedValue(null);

    mockQueryRunner.manager.findOne.mockResolvedValue({
      id: 'wallet-1',
      userId: 'user-1',
    });

    const lockedBalanceQuery = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'bal-1',
        walletId: 'wallet-1',
        currency: 'NGN',
        balance: 1000,
      }),
    };

    mockQueryRunner.manager.createQueryBuilder.mockReturnValue(lockedBalanceQuery);
    mockQueryRunner.manager.create.mockReturnValue({
      userId: 'user-1',
      type: 'FUNDING',
    });

    mockQueryRunner.manager.save
      .mockResolvedValueOnce({
        id: 'bal-1',
        walletId: 'wallet-1',
        currency: 'NGN',
        balance: 1200,
      })
      .mockResolvedValueOnce({
        id: 'tx-1',
      });

    const result: any = await service.fundWallet('user-1', {
      amount: 200,
      idempotencyKey: '1234567890123456',
    });

    expect(result.transactionId).toBe('tx-1');
    expect(result.balance).toBe(1200);
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
  });
});
