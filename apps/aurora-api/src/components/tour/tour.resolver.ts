import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { Tour, Tours } from '../../libs/dto/tour/tour';
import {
	AgentToursInquiry,
	AllToursInquiry,
	OrdinaryTourInquiry,
	TourInput,
	ToursInquiry,
} from '../../libs/dto/tour/tour.input';
import { TourUpdateInput, UpdateTourStatusInput } from '../../libs/dto/tour/tour.update';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WithoutGuard } from '../auth/guards/without.guard';
import { TourService } from './tour.service';

@Resolver()
export class TourResolver {
	constructor(private readonly tourService: TourService) { }

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Tour)
	public async createTour(@Args('input') input: TourInput, @AuthMember('_id') memberId: Types.ObjectId): Promise<Tour> {
		input.memberId = memberId;
		input.destinationId = shapeIntoMongoObjectId(input.destinationId);
		return this.tourService.createTour(input);
	}

	@UseGuards(WithoutGuard)
	@Query(() => Tour)
	public async getTour(@Args('tourId') tourId: string, @AuthMember('_id') memberId: Types.ObjectId): Promise<Tour> {
		return this.tourService.getTour(memberId, shapeIntoMongoObjectId(tourId));
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Tour)
	public async updateTour(
		@Args('input') input: TourUpdateInput,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Tour> {
		input._id = shapeIntoMongoObjectId(input._id);
		if (input.destinationId) input.destinationId = shapeIntoMongoObjectId(input.destinationId);
		return this.tourService.updateTour(memberId, input);
	}

	@UseGuards(WithoutGuard)
	@Query(() => Tours)
	public async getTours(@Args('input') input: ToursInquiry, @AuthMember('_id') memberId: Types.ObjectId): Promise<Tours> {
		return this.tourService.getTours(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Tours)
	public async getFavoriteTours(
		@Args('input') input: OrdinaryTourInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Tours> {
		return this.tourService.getFavoriteTours(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Tours)
	public async getVisitedTours(
		@Args('input') input: OrdinaryTourInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Tours> {
		return this.tourService.getVisitedTours(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Tour)
	public async likeTargetTour(
		@Args('tourId') tourId: string,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Tour> {
		return this.tourService.likeTargetTour(memberId, shapeIntoMongoObjectId(tourId));
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => Tours)
	public async getAgentTours(
		@Args('input') input: AgentToursInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Tours> {
		return this.tourService.getAgentTours(memberId, input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Tours)
	public async getAllToursByAdmin(@Args('input') input: AllToursInquiry): Promise<Tours> {
		return this.tourService.getAllToursByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Tour)
	public async updateTourStatusByAdmin(@Args('input') input: UpdateTourStatusInput, @AuthMember('_id') adminId: Types.ObjectId): Promise<Tour> {
		input._id = shapeIntoMongoObjectId(input._id);
		return this.tourService.updateTourStatusByAdmin(input, adminId);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Tour)
	public async removeTourByAdmin(@Args('tourId') tourId: string): Promise<Tour> {
		return this.tourService.removeTourByAdmin(shapeIntoMongoObjectId(tourId));
	}
}
