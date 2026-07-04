// backend/src/app.controller.ts
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import type { AppHealthResponse } from './app.service';

@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHealth(): AppHealthResponse {
    return this.appService.getHealth();
  }
}
