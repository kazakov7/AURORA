import { Controller, Get } from '@nestjs/common';
import { AuroraBatchService } from './aurora-batch.service';

@Controller()
export class AuroraBatchController {
  constructor(private readonly auroraBatchService: AuroraBatchService) {}

  @Get()
  getHello(): string {
    return this.auroraBatchService.getHello();
  }
}
