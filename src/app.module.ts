import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { typeOrmConfig } from './config/typeorm.config';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { AuthenticationModule } from './services/auth/authentication.module';
import { JwtAuthGuard } from './services/auth/jwt-auth.guard';
import { WalletModule } from './services/wallet/wallet.module';
import { FxModule } from './services/fx/fx.module';
import { TransactionModule } from './services/transactions/transaction.module';
import { TradingModule } from './services/trading/trading.module';
import { CacheModule } from './services/cache/cache.module';

@Module({
  imports: [
    // Environment configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),

    // TypeORM configuration
    TypeOrmModule.forRootAsync({
      useFactory: typeOrmConfig,
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 60, // 60 requests per minute
      },
    ]),

    // Feature modules
    HealthModule,
    AuthenticationModule,
    WalletModule,
    FxModule,
    TransactionModule,
    TradingModule,
    CacheModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
