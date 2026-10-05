import { registerEnumType } from '@nestjs/graphql';

export enum ChatType {
	DIRECT = 'DIRECT',
	GLOBAL = 'GLOBAL',
}
registerEnumType(ChatType, { name: 'ChatType' });
