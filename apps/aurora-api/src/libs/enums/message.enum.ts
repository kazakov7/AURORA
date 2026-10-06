import { registerEnumType } from '@nestjs/graphql';

export enum MessageType {
	TEXT = 'TEXT',
	IMAGE = 'IMAGE',
}
registerEnumType(MessageType, {
	name: 'MessageType',
});
