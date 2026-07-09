// backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { ScalesModule } from './modules/scales/scales.module';
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
    ScalesModule,
    StorageModule,
  ],
  controllers: [AppController],
  providers: [AppService, AllExceptionsFilter],
})
export class AppModule {}
