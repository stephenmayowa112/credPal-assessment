import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  PaginationDto,
  TransactionFiltersDto,
} from '../../common/dto/transaction.dto';
import { User } from '../../entities/user.entity';
import { VerifiedUserGuard } from '../auth/verified-user.guard';
import { TransactionService } from './transaction.service';

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(VerifiedUserGuard)
@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get()
  @ApiOperation({ summary: 'Get transaction history' })
  getHistory(
    @CurrentUser() user: User,
    @Query() filters: TransactionFiltersDto,
    @Query() pagination: PaginationDto,
  ) {
    return this.transactionService.getTransactionHistory(user.id, filters, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transaction by ID' })
  getById(@CurrentUser() user: User, @Param('id') id: string) {
    return this.transactionService.getTransactionById(user.id, id);
  }
}
