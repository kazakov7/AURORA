import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { PropertyService } from './property.service';
import { UseGuards } from '@nestjs/common';
import { Properties, Property } from '../../libs/dto/property/property';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { WithoutGuard } from '../auth/guards/without.guard';
import { Types } from 'mongoose';
import { AuthGuard } from '../auth/guards/auth.guard';
import {
	AgentPropertiesInquiry,
	AllPropertiesInquiry,
	CreatePropertyInput,
	OrdinaryInquery,
	PropertiesInquiry,
} from '../../libs/dto/property/property.input';
import {
	UpdatePropertyInput,
	UpdatePropertyStatusInput,
} from '../../libs/dto/property/property.update';

@Resolver()
export class PropertyResolver {
	constructor(private readonly propertyService: PropertyService) {}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Property)
	public async createProperty(
		@Args('input') input: CreatePropertyInput,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Property> {
		input.memberId = memberId;
		return this.propertyService.createProperty(input);
	}

	@UseGuards(WithoutGuard)
	@Query(() => Property)
	public async getProperty(
		@Args('propertyId') input: string,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Property> {
		const propertyId = shapeIntoMongoObjectId(input);
		return this.propertyService.getProperty(memberId, propertyId);
	}
	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Property)
	public async updateProperty(
		@Args('input') input: UpdatePropertyInput,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Property> {
		input._id = shapeIntoMongoObjectId(input._id);
		return this.propertyService.updateProperty(memberId, input);
	}

	@UseGuards(WithoutGuard)
	@Query(() => Properties)
	public async getProperties(
		@Args('input') input: PropertiesInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Properties> {
		return this.propertyService.getProperties(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Properties)
	public async getFavorites(
		@Args('input') input: OrdinaryInquery,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Properties> {
		return this.propertyService.getFavorites(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Properties)
	public async getVisited(
		@Args('input') input: OrdinaryInquery,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Properties> {
		return this.propertyService.getVisited(memberId, input);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => Properties)
	public async getAgentProperties(
		@Args('input') input: AgentPropertiesInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Properties> {
		return this.propertyService.getAgentProperties(memberId, input);
	}
	@UseGuards(AuthGuard)
	@Mutation(() => Property)
	public async likeTargetProperty(
		@Args('propertyId') input: string,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Property> {
		const likeRefId = shapeIntoMongoObjectId(input);
		return this.propertyService.likeTargetProperty(memberId, likeRefId);
	}
	// ADMIN

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Properties)
	public async getAllPropertiesByAdmin(
		@Args('input') input: AllPropertiesInquiry,
	): Promise<Properties> {
		return this.propertyService.getAllPropertiesByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Property)
	public async updatePropertyStatusByAdmin(
		@Args('input') input: UpdatePropertyStatusInput,
		@AuthMember('_id') adminId: Types.ObjectId,
	): Promise<Property> {
		input._id = shapeIntoMongoObjectId(input._id);
		return this.propertyService.updatePropertyStatusByAdmin(input, adminId);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Property)
	public async removePropertyByAdmin(@Args('propertyId') input: string): Promise<Property> {
		const propertyId = shapeIntoMongoObjectId(input);
		return this.propertyService.removePropertyByAdmin(propertyId);
	}
}
