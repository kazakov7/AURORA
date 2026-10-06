import { Module } from '@nestjs/common';
import { AuroraBatchController } from './aurora-batch.controller';
import { AuroraBatchService } from './aurora-batch.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [AuroraBatchController],
  providers: [AuroraBatchService],
})
export class AuroraBatchModule {}
