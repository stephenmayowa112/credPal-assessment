import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from '../../entities/wallet.entity';
import { WalletBalance } from '../../entities/wallet-balance.entity';
import { FxModule } from '../fx/fx.module';
import { TransactionModule } from '../transactions/transaction.module';
import { TradingService } from './trading.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, WalletBalance]),
    FxModule,
    TransactionModule,
  ],
  providers: [TradingService],
  exports: [TradingService],
})
export class TradingModule {}
