import { ForbiddenException } from '@nestjs/common';
import type { RequestContextService } from '@lark-apaas/nestjs-common';
import { ApaasUserIdentityService } from './apaas-user-identity.service';

describe('ApaasUserIdentityService', () => {
  it('uses the stable Miaoda account ID from request context', () => {
    const requestContext = {
      get: jest.fn().mockReturnValue('miaoda-account-id'),
    } as unknown as RequestContextService;
    const service = new ApaasUserIdentityService(requestContext);

    expect(service.requireAccountId()).toBe('miaoda-account-id');
    expect(requestContext.get).toHaveBeenCalledWith('userId');
  });

  it.each([undefined, '', '   '])(
    'rejects an invalid Miaoda account ID: %p',
    (accountId) => {
      const requestContext = {
        get: jest.fn().mockReturnValue(accountId),
      } as unknown as RequestContextService;
      const service = new ApaasUserIdentityService(requestContext);

      expect(() => service.requireAccountId()).toThrow(ForbiddenException);
    },
  );
});
