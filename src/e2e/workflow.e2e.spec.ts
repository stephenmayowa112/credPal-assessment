import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthenticationController } from '../services/auth/authentication.controller';
import { AuthenticationService } from '../services/auth/authentication.service';
import { VerifiedUserGuard } from '../services/auth/verified-user.guard';
import { FxController } from '../services/fx/fx.controller';
import { FxService } from '../services/fx/fx.service';
import { TradingController } from '../services/trading/trading.controller';
import { TradingService } from '../services/trading/trading.service';
import { TransactionController } from '../services/transactions/transaction.controller';
import { TransactionService } from '../services/transactions/transaction.service';
import { WalletController } from '../services/wallet/wallet.controller';
import { WalletService } from '../services/wallet/wallet.service';

describe('Workflow E2E', () => {
  let app: INestApplication;

  const mockAuthenticationService = {
    register: jest.fn().mockResolvedValue({
      userId: 'user-1',
      message: 'Registration successful. Please check your email for OTP verification.',
    }),
    verifyEmail: jest.fn().mockResolvedValue({
      success: true,
      message: 'Email verified successfully',
    }),
    login: jest.fn().mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresIn: 900,
    }),
    refreshToken: jest.fn().mockResolvedValue({
      accessToken: 'new-access-token',
      tokenType: 'Bearer',
      expiresIn: 900,
    }),
    resendOTP: jest.fn().mockResolvedValue({
      success: true,
      message: 'OTP resent successfully',
    }),
  };

  const mockWalletService = {
    getBalances: jest.fn().mockResolvedValue([
      { currency: 'NGN', balance: 1000 },
      { currency: 'USD', balance: 5 },
    ]),
    fundWallet: jest.fn().mockResolvedValue({
      transactionId: 'tx-fund-1',
      currency: 'NGN',
      amount: 1000,
      balance: 2000,
      status: 'SUCCESS',
    }),
  };

  const mockTradingService = {
    convertCurrency: jest.fn().mockResolvedValue({
      transactionId: 'tx-convert-1',
      sourceCurrency: 'NGN',
      targetCurrency: 'USD',
      sourceAmount: 1000,
      targetAmount: 0.65,
      fxRate: 0.00065,
      status: 'SUCCESS',
      timestamp: new Date().toISOString(),
    }),
    trade: jest.fn().mockResolvedValue({
      transactionId: 'tx-trade-1',
      sourceCurrency: 'USD',
      targetCurrency: 'NGN',
      sourceAmount: 10,
      targetAmount: 15000,
      fxRate: 1500,
      status: 'SUCCESS',
      timestamp: new Date().toISOString(),
      type: 'TRADE',
    }),
  };

  const mockFxService = {
    getRate: jest.fn().mockResolvedValue({
      from: 'NGN',
      to: 'USD',
      rate: 0.00065,
      source: 'cache',
      timestamp: new Date().toISOString(),
    }),
  };

  const mockTransactionService = {
    getTransactionHistory: jest.fn().mockResolvedValue({
      data: [
        {
          id: 'tx-fund-1',
          type: 'FUNDING',
          sourceCurrency: 'NGN',
          targetCurrency: 'NGN',
        },
      ],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    }),
    getTransactionById: jest.fn().mockResolvedValue({
      id: 'tx-fund-1',
      type: 'FUNDING',
      sourceCurrency: 'NGN',
      targetCurrency: 'NGN',
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        AuthenticationController,
        WalletController,
        TradingController,
        TransactionController,
        FxController,
      ],
      providers: [
        {
          provide: AuthenticationService,
          useValue: mockAuthenticationService,
        },
        {
          provide: WalletService,
          useValue: mockWalletService,
        },
        {
          provide: TradingService,
          useValue: mockTradingService,
        },
        {
          provide: FxService,
          useValue: mockFxService,
        },
        {
          provide: TransactionService,
          useValue: mockTransactionService,
        },
        {
          provide: VerifiedUserGuard,
          useValue: { canActivate: () => true },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.use((req: any, _res: any, next: () => void) => {
      req.user = {
        id: 'user-1',
        email: 'test@example.com',
        isVerified: true,
      };
      next();
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should complete auth flow endpoints', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'test@example.com', password: 'Password123' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.userId).toBe('user-1');
      });

    await request(app.getHttpServer())
      .post('/auth/verify')
      .send({ userId: 'user-1', otp: '123456' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.success).toBe(true);
      });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'Password123' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.accessToken).toBe('access-token');
        expect(body.refreshToken).toBe('refresh-token');
      });
  });

  it('should complete wallet funding and conversion endpoints', async () => {
    await request(app.getHttpServer())
      .get('/wallet/balances')
      .expect(200)
      .expect(({ body }) => {
        expect(Array.isArray(body)).toBe(true);
      });

    await request(app.getHttpServer())
      .post('/wallet/fund')
      .send({ amount: 1000, idempotencyKey: '1234567890123456' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.transactionId).toBe('tx-fund-1');
      });

    await request(app.getHttpServer())
      .post('/wallet/convert')
      .send({
        sourceCurrency: 'NGN',
        targetCurrency: 'USD',
        sourceAmount: 1000,
        idempotencyKey: '1234567890123457',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.transactionId).toBe('tx-convert-1');
      });
  });

  it('should expose trading rates and transactions endpoints', async () => {
    await request(app.getHttpServer())
      .get('/trading/rates')
      .query({ from: 'NGN', to: 'USD' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.rate).toBe(0.00065);
      });

    await request(app.getHttpServer())
      .post('/trading/trade')
      .send({
        sourceCurrency: 'USD',
        targetCurrency: 'NGN',
        sourceAmount: 10,
        idempotencyKey: '1234567890123458',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.transactionId).toBe('tx-trade-1');
      });

    await request(app.getHttpServer())
      .get('/transactions')
      .expect(200)
      .expect(({ body }) => {
        expect(body.meta.total).toBe(1);
      });

    await request(app.getHttpServer())
      .get('/transactions/tx-fund-1')
      .expect(200)
      .expect(({ body }) => {
        expect(body.id).toBe('tx-fund-1');
      });
  });
});
