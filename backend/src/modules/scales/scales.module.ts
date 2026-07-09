// backend/src/modules/scales/scales.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ScaleDefinition,
  ScaleDefinitionSchema,
} from './schemas/scale-definition.schema';
import {
  ScaleVersion,
  ScaleVersionSchema,
} from './schemas/scale-version.schema';
import { ScalesService } from './services/scales.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScaleDefinition.name, schema: ScaleDefinitionSchema },
      { name: ScaleVersion.name, schema: ScaleVersionSchema },
    ]),
  ],
  providers: [ScalesService],
  exports: [ScalesService],
})
export class ScalesModule {}
