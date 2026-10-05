import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { Booking, Bookings } from '../../libs/dto/booking/booking';
import { BookingsInquiry, CreatePropertyBookingInput, CreateTourBookingInput } from '../../libs/dto/booking/booking.input';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BookingService } from './booking.service';

@Resolver()
export class BookingResolver {
	constructor(private readonly bookingService: BookingService) {}

	@UseGuards(AuthGuard)
	@Mutation(() => Booking)
	public async createPropertyBooking(
		@Args('input') input: CreatePropertyBookingInput,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Booking> {
		input.propertyId = shapeIntoMongoObjectId(input.propertyId);
		return this.bookingService.createPropertyBooking(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Booking)
	public async cancelBooking(
		@Args('bookingId') bookingId: string,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Booking> {
		return this.bookingService.cancelBooking(memberId, shapeIntoMongoObjectId(bookingId));
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Booking)
	public async createTourBooking(
		@Args('input') input: CreateTourBookingInput,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Booking> {
		input.tourId = shapeIntoMongoObjectId(input.tourId);
		return this.bookingService.createTourBooking(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Booking)
	public async cancelTourBooking(
		@Args('bookingId') bookingId: string,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Booking> {
		return this.bookingService.cancelTourBooking(memberId, shapeIntoMongoObjectId(bookingId));
	}

	@UseGuards(AuthGuard)
	@Query(() => Bookings)
	public async getMyBookings(
		@Args('input') input: BookingsInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Bookings> {
		return this.bookingService.getMyBookings(memberId, input);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => Bookings)
	public async getAgentPropertyBookings(
		@Args('input') input: BookingsInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Bookings> {
		return this.bookingService.getAgentPropertyBookings(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Bookings)
	public async getMyTourBookings(
		@Args('input') input: BookingsInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Bookings> {
		return this.bookingService.getMyTourBookings(memberId, input);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => Bookings)
	public async getAgentTourBookings(
		@Args('input') input: BookingsInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Bookings> {
		return this.bookingService.getAgentTourBookings(memberId, input);
	}
}
