// backend/src/modules/cognitive-domains/cognitive-domains.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CognitiveDomainResult,
  CognitiveDomainResultSchema,
} from './schemas/cognitive-domain-result.schema';
import { CognitiveDomainsService } from './services/cognitive-domains.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: CognitiveDomainResult.name,
        schema: CognitiveDomainResultSchema,
      },
    ]),
  ],
  providers: [CognitiveDomainsService],
  exports: [CognitiveDomainsService],
})
export class CognitiveDomainsModule {}
