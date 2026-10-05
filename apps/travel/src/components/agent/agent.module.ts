import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import AgentSchema from '../../schemas/Agent.model';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Agent', schema: AgentSchema }])],
})
export class AgentModule {}
