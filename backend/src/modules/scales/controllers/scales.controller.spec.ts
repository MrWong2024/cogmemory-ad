import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../../auth/auth.constants';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { ScaleCatalogService } from '../services/scale-catalog.service';
import { ScalesController } from './scales.controller';

describe('ScalesController', () => {
  let controller: ScalesController;
  let scaleCatalogService: {
    listAvailableScaleOptions: jest.Mock;
  };

  beforeEach(async () => {
    scaleCatalogService = {
      listAvailableScaleOptions: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ScalesController],
      providers: [
        {
          provide: ScaleCatalogService,
          useValue: scaleCatalogService,
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(ScalesController);
  });

  it('binds explicit session and role guards with patient workflow roles', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ScalesController)).toEqual(
      PATIENT_WORKFLOW_ROLES,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, ScalesController)).toEqual([
      SessionAuthGuard,
      RolesGuard,
    ]);
  });

  it('returns the safe catalog list from ScaleCatalogService', () => {
    const items = [{ code: 'mmse', version: '1.0' }];
    scaleCatalogService.listAvailableScaleOptions.mockReturnValue(items);

    expect(controller.getAvailableScales()).toEqual({ items });
    expect(scaleCatalogService.listAvailableScaleOptions).toHaveBeenCalledTimes(
      1,
    );
  });
});
