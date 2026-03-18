import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConvertCurrencyDto, GetRateDto, TradeDto } from '../../common/dto/trading.dto';
import { User } from '../../entities/user.entity';
import { VerifiedUserGuard } from '../auth/verified-user.guard';
import { FxService } from '../fx/fx.service';
import { TradingService } from './trading.service';

@ApiTags('trading')
@ApiBearerAuth()
@UseGuards(VerifiedUserGuard)
@Controller('trading')
export class TradingController {
  constructor(
    private readonly tradingService: TradingService,
    private readonly fxService: FxService,
  ) {}

  @Post('convert')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Convert currency using real-time FX rates' })
  convert(@CurrentUser() user: User, @Body() dto: ConvertCurrencyDto) {
    return this.tradingService.convertCurrency(user.id, dto);
  }

  @Post('trade')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Trade NGN with foreign currency and vice versa' })
  trade(@CurrentUser() user: User, @Body() dto: TradeDto) {
    return this.tradingService.trade(user.id, dto);
  }

  @Get('rates')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get FX rate for a currency pair' })
  rates(@Query() dto: GetRateDto) {
    return this.fxService.getRate(dto.from, dto.to);
  }
}
