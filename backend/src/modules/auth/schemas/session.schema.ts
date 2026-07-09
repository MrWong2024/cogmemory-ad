// backend/src/modules/auth/schemas/session.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export const SESSION_STATUSES = ['active', 'revoked', 'expired'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export type SessionMetadata = Record<string, unknown> | null;

@Schema({ timestamps: true, collection: 'sessions' })
export class Session {
  @Prop({ type: SchemaTypes.ObjectId, ref: User.name, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, select: false })
  sessionTokenHash!: string;

  @Prop({
    type: String,
    enum: SESSION_STATUSES,
    required: true,
    default: 'active',
  })
  status!: SessionStatus;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt?: Date | null;

  @Prop({ type: Date, default: null })
  lastSeenAt?: Date | null;

  @Prop({ type: String, trim: true })
  userAgent?: string;

  @Prop({ type: String, trim: true })
  ipAddress?: string;

  @Prop({ type: [{ type: String, trim: true }], default: [] })
  rolesSnapshot!: string[];

  @Prop({ type: [{ type: String, trim: true }], default: [] })
  permissionsSnapshot!: string[];

  @Prop({ type: SchemaTypes.Mixed, default: null })
  metadata?: SessionMetadata;
}

export type SessionDocument = HydratedDocument<Session> & {
  _id: Types.ObjectId;
};

export const SessionSchema = SchemaFactory.createForClass(Session);

SessionSchema.index({ sessionTokenHash: 1 }, { unique: true });
SessionSchema.index({ userId: 1, status: 1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SessionSchema.index({ status: 1, updatedAt: -1 });
SessionSchema.index({ userId: 1, createdAt: -1 });
