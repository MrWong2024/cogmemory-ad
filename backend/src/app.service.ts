// backend/src/app.service.ts
import { Injectable } from '@nestjs/common';

export type AppHealthResponse = {
  status: 'ok';
  service: 'cogmemory-ad-backend';
};

@Injectable()
export class AppService {
  getHealth(): AppHealthResponse {
    return {
      status: 'ok',
      service: 'cogmemory-ad-backend',
    };
  }
}
