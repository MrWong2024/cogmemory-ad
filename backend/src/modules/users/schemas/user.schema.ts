// backend/src/modules/users/schemas/user.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export const USER_TYPES = [
  'admin',
  'doctor',
  'nurse',
  'research_assistant',
  'system',
] as const;
export type UserType = (typeof USER_TYPES)[number];

export const USER_STATUSES = [
  'active',
  'disabled',
  'locked',
  'archived',
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export type UserMetadata = Record<string, unknown> | null;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ type: String, required: true, trim: true, lowercase: true })
  accountName!: string;

  @Prop({ type: String, required: true, trim: true })
  displayName!: string;

  @Prop({ type: String, trim: true, uppercase: true })
  staffCode?: string;

  @Prop({ type: String, trim: true, lowercase: true })
  email?: string;

  @Prop({ type: String, trim: true })
  phone?: string;

  @Prop({ type: String, required: true, select: false })
  passwordHash!: string;

  @Prop({ type: Date, default: null })
  passwordChangedAt?: Date | null;

  @Prop({ type: [{ type: String, trim: true }], default: [] })
  roles!: string[];

  @Prop({ type: [{ type: String, trim: true }], default: [] })
  permissions!: string[];

  @Prop({
    type: String,
    enum: USER_TYPES,
    required: true,
    default: 'doctor',
  })
  userType!: UserType;

  @Prop({
    type: String,
    enum: USER_STATUSES,
    required: true,
    default: 'active',
  })
  status!: UserStatus;

  @Prop({ type: String, trim: true })
  department?: string;

  @Prop({ type: String, trim: true })
  organization?: string;

  @Prop({ type: Date, default: null })
  lastLoginAt?: Date | null;

  @Prop({ type: Number, default: 0 })
  failedLoginCount!: number;

  @Prop({ type: Date, default: null })
  lockedUntil?: Date | null;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  metadata?: UserMetadata;
}

export type UserDocument = HydratedDocument<User> & {
  _id: Types.ObjectId;
};

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ accountName: 1 }, { unique: true });
UserSchema.index({ staffCode: 1 }, { unique: true, sparse: true });
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ phone: 1 }, { sparse: true });
UserSchema.index({ status: 1, accountName: 1 });
UserSchema.index({ roles: 1, status: 1 });
UserSchema.index({ userType: 1, status: 1 });
