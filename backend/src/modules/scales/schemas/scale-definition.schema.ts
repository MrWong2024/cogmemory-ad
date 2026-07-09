// backend/src/modules/scales/schemas/scale-definition.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export const SCALE_DEFINITION_CATEGORIES = ['cognitive'] as const;
export type ScaleDefinitionCategory =
  (typeof SCALE_DEFINITION_CATEGORIES)[number];

export const SCALE_STATUSES = ['draft', 'active', 'retired'] as const;
export type ScaleStatus = (typeof SCALE_STATUSES)[number];

@Schema({ timestamps: true, collection: 'scale_definitions' })
export class ScaleDefinition {
  @Prop({ type: String, required: true, trim: true, lowercase: true })
  code!: string;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, trim: true })
  shortName?: string;

  @Prop({ type: String, trim: true })
  description?: string;

  @Prop({
    type: String,
    enum: SCALE_DEFINITION_CATEGORIES,
    required: true,
    default: 'cognitive',
  })
  category!: ScaleDefinitionCategory;

  @Prop({
    type: String,
    enum: SCALE_STATUSES,
    required: true,
    default: 'draft',
  })
  status!: ScaleStatus;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'ScaleVersion', default: null })
  currentVersionId?: Types.ObjectId | null;

  @Prop({ type: Number, default: 0 })
  sortOrder!: number;

  @Prop({ type: [{ type: String, trim: true }], default: [] })
  tags!: string[];
}

export type ScaleDefinitionDocument = HydratedDocument<ScaleDefinition> & {
  _id: Types.ObjectId;
};

export const ScaleDefinitionSchema =
  SchemaFactory.createForClass(ScaleDefinition);

ScaleDefinitionSchema.index({ code: 1 }, { unique: true });
ScaleDefinitionSchema.index({ status: 1, sortOrder: 1 });
