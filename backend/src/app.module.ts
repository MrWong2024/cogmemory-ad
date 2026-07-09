// backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { AssessmentsModule } from './modules/assessments/assessments.module';
import { CognitiveDomainsModule } from './modules/cognitive-domains/cognitive-domains.module';
import { MediaModule } from './modules/media/media.module';
import { PatientsModule } from './modules/patients/patients.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ScalesModule } from './modules/scales/scales.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { StorageModule } from './modules/storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('mongo.uri'),
        autoIndex: configService.getOrThrow<boolean>('mongo.autoIndex'),
        serverSelectionTimeoutMS: configService.getOrThrow<number>(
          'mongo.serverSelectionTimeoutMs',
        ),
      }),
    }),
    PatientsModule,
    AssessmentsModule,
    MediaModule,
    ScalesModule,
    ScoringModule,
    CognitiveDomainsModule,
    ReportsModule,
    StorageModule,
  ],
  controllers: [AppController],
  providers: [AppService, AllExceptionsFilter],
})
export class AppModule {}
