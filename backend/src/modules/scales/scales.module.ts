// backend/src/modules/scales/scales.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { ScalesController } from './controllers/scales.controller';
import {
  ScaleDefinition,
  ScaleDefinitionSchema,
} from './schemas/scale-definition.schema';
import {
  ScaleVersion,
  ScaleVersionSchema,
} from './schemas/scale-version.schema';
import { ScaleSeedDataService } from './seeds/scale-seed-data.service';
import { ScaleCatalogService } from './services/scale-catalog.service';
import { PresentationAssetsService } from './services/presentation-assets.service';
import { ScalesService } from './services/scales.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: ScaleDefinition.name, schema: ScaleDefinitionSchema },
      { name: ScaleVersion.name, schema: ScaleVersionSchema },
    ]),
  ],
  controllers: [ScalesController],
  providers: [
    ScalesService,
    ScaleSeedDataService,
    ScaleCatalogService,
    PresentationAssetsService,
  ],
  exports: [
    ScalesService,
    ScaleSeedDataService,
    ScaleCatalogService,
    PresentationAssetsService,
  ],
})
export class ScalesModule {}
