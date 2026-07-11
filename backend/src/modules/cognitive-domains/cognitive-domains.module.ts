// backend/src/modules/cognitive-domains/cognitive-domains.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AssessmentsModule } from '../assessments/assessments.module';
import { PatientsModule } from '../patients/patients.module';
import { ScalesModule } from '../scales/scales.module';
import { ScoringModule } from '../scoring/scoring.module';
import { CognitiveDomainResultsController } from './controllers/cognitive-domain-results.controller';
import {
  CognitiveDomainResult,
  CognitiveDomainResultSchema,
} from './schemas/cognitive-domain-result.schema';
import { CognitiveDomainsService } from './services/cognitive-domains.service';
import { CognitiveDomainComputationWorkflowService } from './services/cognitive-domain-computation-workflow.service';
import { CognitiveDomainResultPublicMapper } from './services/cognitive-domain-result-public.mapper';

@Module({
  imports: [
    AuthModule,
    PatientsModule,
    AssessmentsModule,
    ScalesModule,
    ScoringModule,
    MongooseModule.forFeature([
      {
        name: CognitiveDomainResult.name,
        schema: CognitiveDomainResultSchema,
      },
    ]),
  ],
  controllers: [CognitiveDomainResultsController],
  providers: [
    CognitiveDomainsService,
    CognitiveDomainComputationWorkflowService,
    CognitiveDomainResultPublicMapper,
  ],
  exports: [CognitiveDomainsService],
})
export class CognitiveDomainsModule {}
