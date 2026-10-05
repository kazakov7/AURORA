import { registerEnumType } from '@nestjs/graphql';

export enum Messages {
	// =========================
	// COMMON
	// =========================
	SOMETHING_WENT_WRONG = 'Something went wrong!',
	BAD_REQUEST = 'Bad request!',
	NO_DATA_FOUND = 'No data found!',
	CREATE_FAILED = 'Create failed!',
	UPDATE_FAILED = 'Update failed!',
	REMOVE_FAILED = 'Remove failed!',
	UPLOAD_FAILED = 'Upload failed!',
	INVALID_ID = 'Invalid ID!',
	INVALID_DATA = 'Invalid data!',
	DUPLICATE_DATA = 'Data already exists!',
	SELF_SUBSCRIPTION_DENIED = "SELF SUBSCRIPTION DENIED",

	// =========================
	// AUTH
	// =========================
	WRONG_PASSWORD = 'Wrong password, try again!',
	NOT_AUTHENTICATED = 'You are not authenticated, please login first!',
	TOKEN_NOT_EXIST = 'Bearer token is not provided!',
	TOKEN_EXPIRED = 'Your session has expired, please login again!',
	NOT_AUTHORIZED = 'You are not authorized to perform this action!',

	// =========================
	// MEMBER
	// =========================
	MEMBER_NOT_FOUND = 'Member not found!',
	MEMBER_ALREADY_EXISTS = 'Member already exists!',
	MEMBER_BLOCKED = 'This member has been blocked!',
	MEMBER_ALREADY_BLOCKED = 'This member is already blocked!',
	CANNOT_BLOCK_YOURSELF = 'You cannot block yourself!',
	CANNOT_UPDATE_MEMBER = 'You cannot update this member!',

	// =========================
	// AGENT
	// =========================
	AGENT_NOT_FOUND = 'Agent not found!',
	AGENT_ALREADY_EXISTS = 'Agent already exists!',
	AGENT_NOT_VERIFIED = 'Agent is not verified!',
	AGENT_ALREADY_VERIFIED = 'Agent is already verified!',
	AGENT_APPLICATION_EXISTS = 'Agent application already exists!',
	AGENT_APPLICATION_NOT_FOUND = 'Agent application not found!',
	AGENT_NOT_ALLOWED = 'You are not allowed to perform this agent action!',

	// =========================
	// COUNTRY / CITY / DESTINATION
	// =========================
	COUNTRY_NOT_FOUND = 'Country not found!',
	COUNTRY_ALREADY_EXISTS = 'Country already exists!',

	CITY_NOT_FOUND = 'City not found!',
	CITY_ALREADY_EXISTS = 'City already exists!',

	DESTINATION_NOT_FOUND = 'Destination not found!',
	DESTINATION_ALREADY_EXISTS = 'Destination already exists!',

	// =========================
	// PROPERTY / HOTEL
	// =========================
	PROPERTY_NOT_FOUND = 'Property not found!',
	PROPERTY_ALREADY_EXISTS = 'Property already exists!',
	PROPERTY_NOT_AVAILABLE = 'Property is not available!',
	PROPERTY_NOT_OWNED = 'You are not the owner of this property!',
	PROPERTY_CANNOT_BE_BOOKED = 'This property cannot be booked!',

	// =========================
	// ROOM
	// =========================
	ROOM_NOT_FOUND = 'Room not found!',
	ROOM_ALREADY_EXISTS = 'Room already exists!',
	ROOM_NOT_AVAILABLE = 'Room is not available!',
	ROOM_NOT_ENOUGH = 'Not enough rooms available!',
	ROOM_ALREADY_BOOKED = 'This room is already booked!',

	// =========================
	// TOUR
	// =========================
	TOUR_NOT_FOUND = 'Tour not found!',
	TOUR_ALREADY_EXISTS = 'Tour already exists!',
	TOUR_NOT_AVAILABLE = 'Tour is not available!',
	TOUR_NOT_OWNED = 'You are not the owner of this tour!',
	TOUR_FULL = 'This tour is fully booked!',

	// =========================
	// TOUR SCHEDULE
	// =========================
	SCHEDULE_NOT_FOUND = 'Tour schedule not found!',
	SCHEDULE_ALREADY_EXISTS = 'Tour schedule already exists!',
	SCHEDULE_NOT_AVAILABLE = 'This schedule is not available!',
	SCHEDULE_FULL = 'This schedule is fully booked!',
	SCHEDULE_DATE_INVALID = 'Invalid schedule date!',

	// =========================
	// BOOKING
	// =========================
	BOOKING_NOT_FOUND = 'Booking not found!',
	BOOKING_ALREADY_EXISTS = 'Booking already exists!',
	BOOKING_NOT_AVAILABLE = 'Booking is not available!',
	BOOKING_ALREADY_CANCELLED = 'Booking is already cancelled!',
	BOOKING_CANNOT_CANCEL = 'This booking cannot be cancelled!',
	BOOKING_CANNOT_UPDATE = 'This booking cannot be updated!',
	BOOKING_EXPIRED = 'This booking has expired!',

	// =========================
	// PAYMENT
	// =========================
	PAYMENT_NOT_FOUND = 'Payment not found!',
	PAYMENT_FAILED = 'Payment failed!',
	PAYMENT_ALREADY_PAID = 'Payment has already been completed!',
	PAYMENT_NOT_COMPLETED = 'Payment has not been completed!',
	PAYMENT_REFUND_FAILED = 'Payment refund failed!',
	REFUND_NOT_ALLOWED = 'Refund is not allowed!',

	// =========================
	// REVIEW
	// =========================
	REVIEW_NOT_FOUND = 'Review not found!',
	REVIEW_ALREADY_EXISTS = 'You have already reviewed this!',
	REVIEW_NOT_ALLOWED = 'You are not allowed to review this!',
	REVIEW_CANNOT_UPDATE = 'You cannot update this review!',

	// =========================
	// COMMENT
	// =========================
	COMMENT_NOT_FOUND = 'Comment not found!',
	COMMENT_ALREADY_DELETED = 'Comment is already deleted!',
	COMMENT_NOT_ALLOWED = 'You are not allowed to modify this comment!',

	// =========================
	// LIKE
	// =========================
	LIKE_NOT_FOUND = 'Like not found!',
	ALREADY_LIKED = 'You already liked this!',
	NOT_LIKED = 'You have not liked this!',

	// =========================
	// FOLLOW
	// =========================
	FOLLOW_NOT_FOUND = 'Follow relationship not found!',
	ALREADY_FOLLOWING = 'You are already following this member!',
	NOT_FOLLOWING = 'You are not following this member!',
	CANNOT_FOLLOW_YOURSELF = 'You cannot follow yourself!',

	// =========================
	// SAVE / WISHLIST
	// =========================
	SAVE_NOT_FOUND = 'Saved item not found!',
	ALREADY_SAVED = 'This item is already saved!',
	NOT_SAVED = 'This item is not saved!',

	// =========================
	// CHAT
	// =========================
	CONVERSATION_NOT_FOUND = 'Conversation not found!',
	MESSAGE_NOT_FOUND = 'Message not found!',
	MESSAGE_NOT_ALLOWED = 'You are not allowed to send messages here!',
	CANNOT_MESSAGE_YOURSELF = 'You cannot send a message to yourself!',
	USER_BLOCKED_MESSAGE = 'You cannot message this member!',

	// =========================
	// NOTIFICATION
	// =========================
	NOTIFICATION_NOT_FOUND = 'Notification not found!',

	// =========================
	// ARTICLE
	// =========================
	ARTICLE_NOT_FOUND = 'Article not found!',
	ARTICLE_ALREADY_EXISTS = 'Article already exists!',
	ARTICLE_NOT_ALLOWED = 'You are not allowed to modify this article!',

	// =========================
	// REPORT
	// =========================
	REPORT_NOT_FOUND = 'Report not found!',
	REPORT_ALREADY_EXISTS = 'You have already reported this!',

	// =========================
	// FILE / IMAGE
	// =========================
	INVALID_FILE_FORMAT = 'Invalid file format!',
	FILE_TOO_LARGE = 'File size is too large!',
	IMAGE_REQUIRED = 'Image is required!',

	ONLY_SPECIFIC_ROLES = 'Only specific roles!',
}
registerEnumType(Messages, {
	name: 'Messages',
});

export enum Direction {
	ASC = 1,
	DESC = -1,
}
registerEnumType(Direction, {
	name: 'Direction',
});
