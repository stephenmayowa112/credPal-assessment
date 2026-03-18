import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { FxController } from './fx.controller';
import { FxService } from './fx.service';

@Module({
  imports: [CacheModule],
  controllers: [FxController],
  providers: [FxService],
  exports: [FxService],
})
export class FxModule {}
