import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { Booking, Bookings, PropertyAvailabilityRange } from '../../libs/dto/booking/booking';
import {
	BookingsInquiry,
	CancelBookingByAdminInput,
	PropertyAvailabilityInquiry,
} from '../../libs/dto/booking/booking.input';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { BookingCategory } from '../../libs/enums/booking.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BookingService } from './booking.service';
import { PaymentService } from '../payment/payment.service';

@Resolver()
export class BookingResolver {
	constructor(
		private readonly bookingService: BookingService,
		private readonly paymentService: PaymentService,
	) {}

	@Query(() => [PropertyAvailabilityRange])
	public async getPropertyAvailability(
		@Args('input') input: PropertyAvailabilityInquiry,
	): Promise<PropertyAvailabilityRange[]> {
		return this.bookingService.getPropertyAvailability(input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Booking)
	public async cancelBooking(
		@Args('bookingId') bookingId: string,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Booking> {
		return this.paymentService.cancelBooking(
			memberId,
			shapeIntoMongoObjectId(bookingId),
			BookingCategory.PROPERTY,
		);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Booking)
	public async cancelTourBooking(
		@Args('bookingId') bookingId: string,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Booking> {
		return this.paymentService.cancelBooking(
			memberId,
			shapeIntoMongoObjectId(bookingId),
			BookingCategory.TOUR,
		);
	}

	@UseGuards(AuthGuard)
	@Query(() => Bookings)
	public async getMyBookings(
		@Args('input') input: BookingsInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Bookings> {
		return this.bookingService.getMyBookings(memberId, input);
	}

	// Scoped to the caller's own listings, so a revoked agent still sees the guests ahead
	@UseGuards(AuthGuard)
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

	// Scoped to the caller's own listings, so a revoked agent still sees the guests ahead
	@UseGuards(AuthGuard)
	@Query(() => Bookings)
	public async getAgentTourBookings(
		@Args('input') input: BookingsInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Bookings> {
		return this.bookingService.getAgentTourBookings(memberId, input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Booking)
	public async cancelBookingByAdmin(
		@Args('input') input: CancelBookingByAdminInput,
		@AuthMember('_id') adminId: Types.ObjectId,
	): Promise<Booking> {
		input._id = shapeIntoMongoObjectId(input._id);
		return this.paymentService.cancelBookingByAdmin(input, adminId);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Bookings)
	public async getAllBookingsByAdmin(@Args('input') input: BookingsInquiry): Promise<Bookings> {
		return this.bookingService.getAllBookingsByAdmin(input);
	}
}
