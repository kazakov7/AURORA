import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, MaxLength } from 'class-validator';

@InputType()
export class ReviewUpdate {
	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(3000)
	reviewContent?: string;
}
