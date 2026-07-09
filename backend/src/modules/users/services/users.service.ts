// backend/src/modules/users/services/users.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  User,
  UserDocument,
  UserMetadata,
  UserStatus,
  UserType,
} from '../schemas/user.schema';

export type UserSummary = {
  id: string;
  accountName: string;
  displayName: string;
  staffCode?: string;
  email?: string;
  phone?: string;
  passwordChangedAt: Date | null;
  roles: string[];
  permissions: string[];
  userType: UserType;
  status: UserStatus;
  department?: string;
  organization?: string;
  lastLoginAt: Date | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
  metadata: UserMetadata;
};

export type UserCredentialRecord = {
  id: string;
  accountName: string;
  displayName: string;
  passwordHash: string;
  passwordChangedAt: Date | null;
  roles: string[];
  permissions: string[];
  userType: UserType;
  status: UserStatus;
  failedLoginCount: number;
  lockedUntil: Date | null;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  normalizeAccountName(accountName: string): string {
    return accountName.trim().toLowerCase();
  }

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  normalizeStaffCode(staffCode: string): string {
    return staffCode.trim().toUpperCase();
  }

  async findUserById(
    userId: Types.ObjectId | string,
  ): Promise<UserSummary | null> {
    const normalizedId = this.normalizeObjectId(userId);

    if (!normalizedId) {
      return null;
    }

    const user = await this.userModel.findOne({ _id: normalizedId }).exec();

    if (!user) {
      return null;
    }

    return this.mapUser(user);
  }

  async findUserByAccountName(
    accountName: string,
  ): Promise<UserSummary | null> {
    const normalizedName = this.normalizeAccountName(accountName);

    if (!normalizedName) {
      return null;
    }

    const user = await this.userModel
      .findOne({ accountName: normalizedName })
      .exec();

    if (!user) {
      return null;
    }

    return this.mapUser(user);
  }

  async findUserCredentialByAccountName(
    accountName: string,
  ): Promise<UserCredentialRecord | null> {
    const normalizedName = this.normalizeAccountName(accountName);

    if (!normalizedName) {
      return null;
    }

    const user = await this.userModel
      .findOne({ accountName: normalizedName })
      .select('+passwordHash')
      .exec();

    if (!user) {
      return null;
    }

    return this.mapUserCredential(user);
  }

  async listActiveUsers(): Promise<UserSummary[]> {
    const users = await this.userModel
      .find({ status: 'active' })
      .sort({ accountName: 1 })
      .exec();

    return users.map((user) => this.mapUser(user));
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

  private mapUser(user: UserDocument): UserSummary {
    return {
      id: user._id.toString(),
      accountName: user.accountName,
      displayName: user.displayName,
      staffCode: user.staffCode,
      email: user.email,
      phone: user.phone,
      passwordChangedAt: user.passwordChangedAt ?? null,
      roles: [...(user.roles ?? [])],
      permissions: [...(user.permissions ?? [])],
      userType: user.userType,
      status: user.status,
      department: user.department,
      organization: user.organization,
      lastLoginAt: user.lastLoginAt ?? null,
      failedLoginCount: user.failedLoginCount ?? 0,
      lockedUntil: user.lockedUntil ?? null,
      metadata: user.metadata ?? null,
    };
  }

  private mapUserCredential(user: UserDocument): UserCredentialRecord {
    return {
      id: user._id.toString(),
      accountName: user.accountName,
      displayName: user.displayName,
      passwordHash: user.passwordHash,
      passwordChangedAt: user.passwordChangedAt ?? null,
      roles: [...(user.roles ?? [])],
      permissions: [...(user.permissions ?? [])],
      userType: user.userType,
      status: user.status,
      failedLoginCount: user.failedLoginCount ?? 0,
      lockedUntil: user.lockedUntil ?? null,
    };
  }
}
