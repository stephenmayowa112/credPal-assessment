import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConvertCurrencyDto, TradeDto } from '../../common/dto/trading.dto';
import { Transaction } from '../../entities/transaction.entity';
import { Wallet } from '../../entities/wallet.entity';
import { WalletBalance } from '../../entities/wallet-balance.entity';
import { FxService } from '../fx/fx.service';
import { TransactionService } from '../transactions/transaction.service';

export interface ConversionResult {
  transactionId: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: number;
  targetAmount: number;
  fxRate: number;
  timestamp: Date;
  status: 'SUCCESS' | 'FAILED';
}

@Injectable()
export class TradingService {
  private readonly SUPPORTED_CURRENCIES = [
    'NGN',
    'USD',
    'EUR',
    'GBP',
    'CAD',
    'AUD',
    'JPY',
  ];

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(WalletBalance)
    private readonly walletBalanceRepository: Repository<WalletBalance>,
    private readonly dataSource: DataSource,
    private readonly fxService: FxService,
    private readonly transactionService: TransactionService,
  ) {}

  async convertCurrency(userId: string, dto: ConvertCurrencyDto): Promise<ConversionResult> {
    return this.executeConversion(userId, dto, 'CONVERSION');
  }

  async trade(userId: string, dto: TradeDto): Promise<ConversionResult & { type: 'TRADE' }> {
    const sourceCurrency = dto.fromCurrency.toUpperCase();
    const targetCurrency = dto.toCurrency.toUpperCase();

    if (sourceCurrency !== 'NGN' && targetCurrency !== 'NGN') {
      throw new BadRequestException('At least one currency in a trade must be NGN');
    }

    const convertDto: ConvertCurrencyDto = {
      sourceCurrency,
      targetCurrency,
      sourceAmount: dto.amount,
      idempotencyKey: dto.idempotencyKey,
    };

    const result = await this.executeConversion(userId, convertDto, 'TRADE');
    return {
      ...result,
      type: 'TRADE',
    };
  }

  private async executeConversion(
    userId: string,
    dto: ConvertCurrencyDto,
    type: 'CONVERSION' | 'TRADE',
  ): Promise<ConversionResult> {
    const sourceCurrency = dto.sourceCurrency.toUpperCase();
    const targetCurrency = dto.targetCurrency.toUpperCase();
    const sourceAmount = Number(dto.sourceAmount);

    this.validateConversionInput(sourceCurrency, targetCurrency, sourceAmount);

    const idempotentResult = this.transactionService.getIdempotencyResult<ConversionResult>(
      dto.idempotencyKey,
    );
    if (idempotentResult) {
      return idempotentResult;
    }

    const rateInfo = await this.fxService.getRate(sourceCurrency, targetCurrency);
    const targetAmount = this.to6(sourceAmount * rateInfo.rate);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { userId },
      });

      if (!wallet) {
        throw new BadRequestException('Wallet not found');
      }

      const sourceBalance = await queryRunner.manager
        .createQueryBuilder(WalletBalance, 'balance')
        .setLock('pessimistic_write')
        .where('balance.walletId = :walletId', { walletId: wallet.id })
        .andWhere('balance.currency = :currency', { currency: sourceCurrency })
        .getOne();

      if (!sourceBalance || Number(sourceBalance.balance) < sourceAmount) {
        throw new BadRequestException('Insufficient balance');
      }

      let targetBalance = await queryRunner.manager
        .createQueryBuilder(WalletBalance, 'balance')
        .setLock('pessimistic_write')
        .where('balance.walletId = :walletId', { walletId: wallet.id })
        .andWhere('balance.currency = :currency', { currency: targetCurrency })
        .getOne();

      if (!targetBalance) {
        targetBalance = this.walletBalanceRepository.create({
          walletId: wallet.id,
          currency: targetCurrency,
          balance: 0,
        });
      }

      sourceBalance.balance = this.to6(Number(sourceBalance.balance) - sourceAmount);
      targetBalance.balance = this.to6(Number(targetBalance.balance) + targetAmount);

      await queryRunner.manager.save(sourceBalance);
      await queryRunner.manager.save(targetBalance);

      const transaction = queryRunner.manager.create(Transaction, {
        userId,
        type,
        sourceCurrency,
        targetCurrency,
        sourceAmount: this.to6(sourceAmount),
        targetAmount,
        fxRate: this.to6(rateInfo.rate),
        status: 'SUCCESS',
        idempotencyKey: dto.idempotencyKey,
      });

      const savedTransaction = await queryRunner.manager.save(transaction);
      await queryRunner.commitTransaction();

      const result = {
        transactionId: savedTransaction.id,
        sourceCurrency,
        targetCurrency,
        sourceAmount: this.to6(sourceAmount),
        targetAmount,
        fxRate: this.to6(rateInfo.rate),
        timestamp: savedTransaction.createdAt,
        status: savedTransaction.status,
      };

      this.transactionService.storeIdempotencyResult(dto.idempotencyKey, result);
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private validateConversionInput(
    sourceCurrency: string,
    targetCurrency: string,
    sourceAmount: number,
  ): void {
    if (!this.SUPPORTED_CURRENCIES.includes(sourceCurrency) || !this.SUPPORTED_CURRENCIES.includes(targetCurrency)) {
      throw new BadRequestException('Unsupported currency');
    }

    if (sourceCurrency === targetCurrency) {
      throw new BadRequestException('Source and target currencies must be different');
    }

    if (sourceAmount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }
  }

  private to6(value: number): number {
    return Number(value.toFixed(6));
  }
}
