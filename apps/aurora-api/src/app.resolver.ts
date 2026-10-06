import { AppService } from './app.service';
import { Resolver, Query } from '@nestjs/graphql';

@Resolver()
export class AppResolver {
	@Query(() => String)
	public getHello(): string {
		return 'Hello';
	}
}
