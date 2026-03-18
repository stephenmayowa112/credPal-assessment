import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FundWalletDto } from '../../common/dto/wallet.dto';
import { Transaction } from '../../entities/transaction.entity';
import { Wallet } from '../../entities/wallet.entity';
import { WalletBalance } from '../../entities/wallet-balance.entity';
import { TransactionService } from '../transactions/transaction.service';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(WalletBalance)
    private readonly walletBalanceRepository: Repository<WalletBalance>,
    private readonly dataSource: DataSource,
    private readonly transactionService: TransactionService,
  ) {}

  async getBalances(userId: string): Promise<Array<{ currency: string; balance: number }>> {
    const wallet = await this.walletRepository.findOne({
      where: { userId },
      relations: ['balances'],
    });

    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }

    return wallet.balances.map((balance) => ({
      currency: balance.currency,
      balance: this.to6(Number(balance.balance)),
    }));
  }

  async getBalance(userId: string, currency: string): Promise<number> {
    const wallet = await this.walletRepository.findOne({ where: { userId } });
    if (!wallet) {
      return 0;
    }

    const balance = await this.walletBalanceRepository.findOne({
      where: { walletId: wallet.id, currency: currency.toUpperCase() },
    });

    return this.to6(Number(balance?.balance ?? 0));
  }

  async fundWallet(userId: string, dto: FundWalletDto) {
    const amount = Number(dto.amount);
    if (amount <= 0 || amount > 10000000) {
      throw new BadRequestException('Invalid funding amount');
    }

    const idempotentResult = await this.transactionService.getIdempotencyResult(dto.idempotencyKey);
    if (idempotentResult) {
      return idempotentResult;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const wallet = await queryRunner.manager.findOne(Wallet, { where: { userId } });
      if (!wallet) {
        throw new BadRequestException('Wallet not found');
      }

      let ngnBalance = await queryRunner.manager
        .createQueryBuilder(WalletBalance, 'balance')
        .setLock('pessimistic_write')
        .where('balance.walletId = :walletId', { walletId: wallet.id })
        .andWhere('balance.currency = :currency', { currency: 'NGN' })
        .getOne();

      if (!ngnBalance) {
        ngnBalance = this.walletBalanceRepository.create({
          walletId: wallet.id,
          currency: 'NGN',
          balance: 0,
        });
      }

      ngnBalance.balance = this.to6(Number(ngnBalance.balance) + amount);
      await queryRunner.manager.save(ngnBalance);

      const transaction = await queryRunner.manager.save(
        queryRunner.manager.create(Transaction, {
          userId,
          type: 'FUNDING',
          sourceCurrency: 'NGN',
          targetCurrency: 'NGN',
          sourceAmount: this.to6(amount),
          targetAmount: this.to6(amount),
          fxRate: 1,
          status: 'SUCCESS',
          idempotencyKey: dto.idempotencyKey,
        }),
      );

      await queryRunner.commitTransaction();

      const result = {
        transactionId: transaction.id,
        currency: 'NGN',
        amount: this.to6(amount),
        balance: this.to6(Number(ngnBalance.balance)),
        status: 'SUCCESS',
      };

      await this.transactionService.storeIdempotencyResult(dto.idempotencyKey, result);
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private to6(value: number): number {
    return Number(value.toFixed(6));
  }
}
