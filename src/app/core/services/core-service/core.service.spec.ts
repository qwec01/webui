import { createServiceFactory, SpectatorService } from '@ngneat/spectator/jest';
import { CoreService } from 'app/core/services/core-service/core.service';

describe('CoreService', () => {
  let spectator: SpectatorService<CoreService>;

  const createService = createServiceFactory({
    service: CoreService,
  });

  /*
   * Test Methods
   * */

  beforeEach(() => {
    spectator = createService();
  });

  it('should instantiate', () => {
    expect(spectator).toBeTruthy();
  });
});
