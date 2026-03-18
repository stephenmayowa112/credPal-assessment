import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetRateDto } from '../../common/dto/trading.dto';
import { VerifiedUserGuard } from '../auth/verified-user.guard';
import { FxService } from './fx.service';

@ApiTags('fx')
@ApiBearerAuth()
@UseGuards(VerifiedUserGuard)
@Controller('fx')
export class FxController {
  constructor(private readonly fxService: FxService) {}

  @Get('rates')
  @ApiOperation({ summary: 'Retrieve current FX rate for a pair' })
  getRate(@Query() query: GetRateDto) {
    return this.fxService.getRate(query.from, query.to);
  }
}
