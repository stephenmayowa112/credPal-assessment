import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { typeOrmConfig } from './config/typeorm.config';
import { redisConfig } from './config/redis.config';
import { HealthModule } from './health/health.module';
import { AuthenticationModule } from './services/auth/authentication.module';
import { JwtAuthGuard } from './services/auth/jwt-auth.guard';

@Module({
  imports: [
    // Environment configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
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
