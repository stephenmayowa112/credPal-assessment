import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthenticationService } from './authentication.service';
import { User } from '../../entities/user.entity';
import { OTP } from '../../entities/otp.entity';
import { Wallet } from '../../entities/wallet.entity';
import { WalletBalance } from '../../entities/wallet-balance.entity';
import { EmailModule } from '../email/email.module';
import { AuthenticationController } from './authentication.controller';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { VerifiedUserGuard } from './verified-user.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, OTP, Wallet, WalletBalance]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    EmailModule,
  ],
  controllers: [AuthenticationController],
  providers: [AuthenticationService, JwtStrategy, JwtAuthGuard, VerifiedUserGuard],
  exports: [AuthenticationService, JwtAuthGuard, VerifiedUserGuard],
})
export class AuthenticationModule {}