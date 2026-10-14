import { HttpException, HttpStatus, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { unwrapResolverError } from '@apollo/server/errors';
import { GraphQLFormattedError } from 'graphql';
import { AppResolver } from './app.resolver';
import { ComponentsModule } from './components/components.module';
import { DatabaseModule } from './database/database.module';

function getSafeErrorMessage(
	formattedError: GraphQLFormattedError,
	originalError: unknown,
): string {
	const exception = unwrapResolverError(originalError);
	if (!(exception instanceof HttpException)) return formattedError.message;

	const response = exception.getResponse();
	if (typeof response === 'string') return response;

	const message = (response as { message?: unknown }).message;
	if (Array.isArray(message))
		return message.filter((item): item is string => typeof item === 'string').join('; ');
	return typeof message === 'string' ? message : formattedError.message;
}

/** Nest reports a 404 or a 429 as INTERNAL_SERVER_ERROR and keeps the real status beside it **/
function getErrorCode(formattedError: GraphQLFormattedError): unknown {
	const { code, status } = formattedError.extensions ?? {};
	if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND';
	if (status === HttpStatus.TOO_MANY_REQUESTS) return 'TOO_MANY_REQUESTS';
	return code;
}

@Module({
	imports: [
		ConfigModule.forRoot(),
		/** Read at startup, after .env is loaded: production shows neither the schema nor the playground **/
		GraphQLModule.forRootAsync<ApolloDriverConfig>({
			driver: ApolloDriver,
			useFactory: () => {
				const isProduction = process.env.NODE_ENV === 'production';
				return {
					playground: !isProduction,
					introspection: !isProduction,
					autoSchemaFile: true,
					formatError: (formattedError: GraphQLFormattedError, originalError: unknown) => {
						const graphQlFormattedError = {
							extensions: {
								code: getErrorCode(formattedError),
							},
							message: getSafeErrorMessage(formattedError, originalError),
						};
						console.log('graphQl server error', graphQlFormattedError);
						return graphQlFormattedError;
					},
				};
			},
		}),
		ComponentsModule,
		DatabaseModule,
	],
	controllers: [AppController],
	providers: [AppService, AppResolver],
})
export class AppModule {}
