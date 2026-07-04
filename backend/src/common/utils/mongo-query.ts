// backend/src/common/utils/mongo-query.ts
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';

export type TimestampFields = {
  createdAt: Date;
  updatedAt: Date;
};

export function assertObjectId(value: string, fieldName = 'id'): void {
  if (!Types.ObjectId.isValid(value)) {
    throw new BadRequestException(`${fieldName} must be a valid ObjectId`);
  }
}

export function toObjectId(value: string, fieldName = 'id'): Types.ObjectId {
  assertObjectId(value, fieldName);
  return new Types.ObjectId(value);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function ensureUniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function assertNoDuplicateStrings(
  values: string[],
  fieldName: string,
): void {
  if (new Set(values).size !== values.length) {
    throw new BadRequestException(`${fieldName} must not contain duplicates`);
  }
}

export function throwConflict(message: string): never {
  throw new ConflictException(message);
}
