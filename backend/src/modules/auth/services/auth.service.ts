// backend/src/modules/auth/services/auth.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { Model, Types } from 'mongoose';
import { UsersService, UserSummary } from '../../users/services/users.service';
import {
  Session,
  SessionDocument,
  SessionMetadata,
} from '../schemas/session.schema';
import type { AuthenticatedUserContext } from '../types/auth-user-context.type';

const PASSWORD_HASH_ALGORITHM = 'scrypt';
const PASSWORD_HASH_VERSION = 'v1';
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_LENGTH = 64;
const SESSION_TOKEN_BYTES = 32;

export type CreateSessionForUserInput = {
  userId: Types.ObjectId | string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
  metadata?: SessionMetadata;
};

export type CreateSessionForUserResult = {
  sessionId: string;
  rawToken: string;
  expiresAt: Date;
  user: AuthenticatedUserContext;
};

function derivePasswordKey(
  plainPassword: string,
  salt: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(plainPassword, salt, PASSWORD_KEY_LENGTH, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Session.name)
    private readonly sessionModel: Model<SessionDocument>,
    private readonly usersService: UsersService,
  ) {}

  async hashPassword(plainPassword: string): Promise<string> {
    const salt = randomBytes(PASSWORD_SALT_BYTES).toString('hex');
    const derivedKey = await derivePasswordKey(plainPassword, salt);

    return [
      PASSWORD_HASH_ALGORITHM,
      PASSWORD_HASH_VERSION,
      salt,
      derivedKey.toString('hex'),
    ].join(':');
  }

  async verifyPassword(
    plainPassword: string,
    storedPasswordHash: string,
  ): Promise<boolean> {
    const parts = storedPasswordHash.split(':');

    if (
      parts.length !== 4 ||
      parts[0] !== PASSWORD_HASH_ALGORITHM ||
      parts[1] !== PASSWORD_HASH_VERSION
    ) {
      return false;
    }

    const [, , salt, hashHex] = parts;

    if (!salt || !hashHex) {
      return false;
    }

    const storedHash = Buffer.from(hashHex, 'hex');

    if (storedHash.length !== PASSWORD_KEY_LENGTH) {
      return false;
    }

    const derivedKey = await derivePasswordKey(plainPassword, salt);

    if (derivedKey.length !== storedHash.length) {
      return false;
    }

    return timingSafeEqual(derivedKey, storedHash);
  }

  generateSessionToken(): string {
    return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  }

  hashSessionToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  async createSessionForUser(
    input: CreateSessionForUserInput,
  ): Promise<CreateSessionForUserResult | null> {
    const normalizedUserId = this.normalizeObjectId(input.userId);

    if (!normalizedUserId) {
      return null;
    }

    const user = await this.usersService.findUserById(normalizedUserId);

    if (!user || user.status !== 'active') {
      return null;
    }

    const rawToken = this.generateSessionToken();
    const sessionTokenHash = this.hashSessionToken(rawToken);
    const session = await this.sessionModel.create({
      userId: normalizedUserId,
      sessionTokenHash,
      status: 'active',
      expiresAt: input.expiresAt,
      revokedAt: null,
      lastSeenAt: null,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      rolesSnapshot: [...user.roles],
      permissionsSnapshot: [...user.permissions],
      metadata: input.metadata ?? null,
    });
    const sessionId = session._id.toString();

    return {
      sessionId,
      rawToken,
      expiresAt: session.expiresAt,
      user: this.buildPublicAuthUser(user, sessionId),
    };
  }

  async validateSessionToken(
    rawToken: string,
  ): Promise<AuthenticatedUserContext | null> {
    const normalizedToken = rawToken.trim();

    if (!normalizedToken) {
      return null;
    }

    const sessionTokenHash = this.hashSessionToken(normalizedToken);
    const session = await this.sessionModel
      .findOne({ sessionTokenHash, status: 'active' })
      .exec();

    if (!session || !this.isSessionActive(session)) {
      return null;
    }

    const user = await this.usersService.findUserById(session.userId);

    if (!user || user.status !== 'active') {
      return null;
    }

    return this.buildPublicAuthUser(user, session._id.toString());
  }

  async revokeSessionByToken(rawToken: string): Promise<boolean> {
    const normalizedToken = rawToken.trim();

    if (!normalizedToken) {
      return false;
    }

    const sessionTokenHash = this.hashSessionToken(normalizedToken);
    const result = await this.sessionModel
      .updateOne(
        { sessionTokenHash, status: 'active' },
        {
          $set: {
            status: 'revoked',
            revokedAt: new Date(),
          },
        },
      )
      .exec();

    return result.modifiedCount > 0;
  }

  buildPublicAuthUser(
    user: UserSummary,
    sessionId?: string,
  ): AuthenticatedUserContext {
    return {
      id: user.id,
      accountName: user.accountName,
      displayName: user.displayName,
      roles: [...user.roles],
      permissions: [...user.permissions],
      sessionId,
      userType: user.userType,
    };
  }

  private normalizeObjectId(
    id: Types.ObjectId | string,
  ): Types.ObjectId | null {
    if (id instanceof Types.ObjectId) {
      return id;
    }

    const normalizedId = id.trim();

    if (!normalizedId || !Types.ObjectId.isValid(normalizedId)) {
      return null;
    }

    const objectId = new Types.ObjectId(normalizedId);

    if (objectId.toString() !== normalizedId.toLowerCase()) {
      return null;
    }

    return objectId;
  }

  private isSessionActive(session: SessionDocument): boolean {
    return (
      session.status === 'active' &&
      !session.revokedAt &&
      session.expiresAt.getTime() > Date.now()
    );
  }
}
