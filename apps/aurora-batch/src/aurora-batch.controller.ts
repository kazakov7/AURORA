import { Controller, ForbiddenException, Get, Headers, Post } from '@nestjs/common';
import { AuroraBatchService } from './aurora-batch.service';

@Controller()
export class AuroraBatchController {
	constructor(private readonly auroraBatchService: AuroraBatchService) {}

	@Get()
	getHello(): string {
		return 'AURORA batch server is running';
	}

	@Post('rankings/run')
	async runRankings(@Headers('x-batch-token') token?: string): Promise<{ started: boolean }> {
		if (!process.env.BATCH_MANUAL_TOKEN || token !== process.env.BATCH_MANUAL_TOKEN)
			throw new ForbiddenException();
		return { started: await this.auroraBatchService.runRankings('manual') };
	}
}
