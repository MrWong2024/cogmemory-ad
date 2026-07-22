// backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import configuration from './config/configuration';
import {
  assertConnectedDatabaseMatchesPurpose,
  assertDeclaredDatabaseMatchesPurpose,
  type TestDatabasePurpose,
} from './config/database-purpose';
import { envValidationSchema } from './config/env.validation';
import { AssessmentsModule } from './modules/assessments/assessments.module';
import { AuthModule } from './modules/auth/auth.module';
import { CognitiveDomainsModule } from './modules/cognitive-domains/cognitive-domains.module';
import { ClinicalHistoryModule } from './modules/clinical-history/clinical-history.module';
import { MediaModule } from './modules/media/media.module';
import { PatientsModule } from './modules/patients/patients.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ScalesModule } from './modules/scales/scales.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { StorageModule } from './modules/storage/storage.module';
import { UsersModule } from './modules/users/users.module';

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
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.getOrThrow<string>('app.env');
        const purpose = configService.get<TestDatabasePurpose>('mongo.purpose');
        const uri = configService.getOrThrow<string>('mongo.uri');
        assertDeclaredDatabaseMatchesPurpose({
          nodeEnv,
          purpose,
          mongoUri: uri,
        });

        return {
          uri,
          autoIndex: configService.getOrThrow<boolean>('mongo.autoIndex'),
          serverSelectionTimeoutMS: configService.getOrThrow<number>(
            'mongo.serverSelectionTimeoutMs',
          ),
          retryAttempts: nodeEnv === 'test' ? 1 : undefined,
          connectionFactory: (connection: Connection) => {
            assertConnectedDatabaseMatchesPurpose({
              nodeEnv,
              purpose,
              databaseName: connection.name,
            });
            return connection;
          },
        };
      },
    }),
    PatientsModule,
    AssessmentsModule,
    MediaModule,
    ScalesModule,
    ScoringModule,
    CognitiveDomainsModule,
    ReportsModule,
    ClinicalHistoryModule,
    UsersModule,
    AuthModule,
    StorageModule,
  ],
  controllers: [AppController],
  providers: [AppService, AllExceptionsFilter],
})
export class AppModule {}
