import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { Destination, Destinations } from '../../libs/dto/destination/destination';
import { DestinationInput, DestinationsInquiry } from '../../libs/dto/destination/destination.input';
import { DestinationUpdate } from '../../libs/dto/destination/destination.update';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WithoutGuard } from '../auth/guards/without.guard';
import { DestinationService } from './destination.service';

@Resolver()
export class DestinationResolver {
	constructor(private readonly destinationService: DestinationService) { }


	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Destination)
	public async createDestination(@Args('input') input: DestinationInput): Promise<Destination> {
		return this.destinationService.createDestination(input);
	}

	@UseGuards(WithoutGuard)
	@Query(() => Destination)
	public async getDestination(
		@Args('destinationId') destinationId: string,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Destination> {
		return this.destinationService.getDestination(memberId, shapeIntoMongoObjectId(destinationId));
	}

	@UseGuards(WithoutGuard)
	@Query(() => Destinations)
	public async getDestinations(
		@Args('input') input: DestinationsInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Destinations> {
		return this.destinationService.getDestinations(memberId, input);
	}



	@UseGuards(AuthGuard)
	@Mutation(() => Destination)
	public async likeTargetDestination(
		@Args('destinationId') destinationId: string,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Destination> {
		return this.destinationService.likeTargetDestination(memberId, shapeIntoMongoObjectId(destinationId));
	}



	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Destination)
	public async updateDestinationByAdmin(@Args('input') input: DestinationUpdate): Promise<Destination> {
		input._id = shapeIntoMongoObjectId(input._id) as unknown as string;
		return this.destinationService.updateDestinationByAdmin(input);
	}


	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => String)
	public async removeDestinationByAdmin(@Args('destinationId') destinationId: string): Promise<String> {
		return this.destinationService.removeDestinationByAdmin(shapeIntoMongoObjectId(destinationId));
	}



}
