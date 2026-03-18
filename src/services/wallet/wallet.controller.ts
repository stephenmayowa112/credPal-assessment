import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConvertCurrencyDto, TradeDto } from '../../common/dto/trading.dto';
import { FundWalletDto } from '../../common/dto/wallet.dto';
import { User } from '../../entities/user.entity';
import { VerifiedUserGuard } from '../auth/verified-user.guard';
import { TradingService } from '../trading/trading.service';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(VerifiedUserGuard)
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly tradingService: TradingService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get wallet balances by currency' })
  getWallet(@CurrentUser() user: User) {
    return this.walletService.getBalances(user.id);
  }

  @Get('balances')
  @ApiOperation({ summary: 'Get wallet balances by currency' })
  getWalletBalances(@CurrentUser() user: User) {
    return this.walletService.getBalances(user.id);
  }

  @Post('fund')
  @ApiOperation({ summary: 'Fund wallet balance' })
  fundWallet(@CurrentUser() user: User, @Body() dto: FundWalletDto) {
    return this.walletService.fundWallet(user.id, dto);
  }

  @Post('convert')
  @ApiOperation({ summary: 'Convert between currencies using FX rates' })
  convert(@CurrentUser() user: User, @Body() dto: ConvertCurrencyDto) {
    return this.tradingService.convertCurrency(user.id, dto);
  }

  @Post('trade')
  @ApiOperation({ summary: 'Trade NGN with other currencies and vice versa' })
  trade(@CurrentUser() user: User, @Body() dto: TradeDto) {
    return this.tradingService.trade(user.id, dto);
  }
}
