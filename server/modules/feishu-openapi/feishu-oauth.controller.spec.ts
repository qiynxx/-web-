jest.mock('@nestjs/common', () => ({
  ...jest.requireActual('@nestjs/common'),
  Controller: () => () => undefined,
  Get: () => () => undefined,
}));
jest.mock('@lark-apaas/fullstack-nestjs-core', () => ({
  NeedLogin: () => () => undefined,
}));

import type { ApaasUserIdentityService } from './apaas-user-identity.service';
import { FeishuOAuthController } from './feishu-oauth.controller';
import type { FeishuOAuthService } from './feishu-oauth.service';

describe('FeishuOAuthController', () => {
  it('checks authorization with the current Miaoda account ID', async () => {
    const oauth = {
      hasAuthorization: jest.fn().mockResolvedValue(true),
    } as unknown as FeishuOAuthService;
    const userIdentity = {
      requireAccountId: jest.fn().mockReturnValue('miaoda-account-id'),
    } as unknown as ApaasUserIdentityService;
    const controller = new FeishuOAuthController(oauth, userIdentity);

    await expect(controller.status()).resolves.toEqual({ authorized: true });
    expect(oauth.hasAuthorization).toHaveBeenCalledWith('miaoda-account-id');
  });

  it('builds OAuth state for the current Miaoda account ID', async () => {
    const oauth = {
      createAuthorizationUrl: jest.fn().mockReturnValue('https://oauth.test'),
    } as unknown as FeishuOAuthService;
    const userIdentity = {
      requireAccountId: jest.fn().mockReturnValue('second-account-id'),
    } as unknown as ApaasUserIdentityService;
    const controller = new FeishuOAuthController(oauth, userIdentity);

    await expect(controller.authorize()).resolves.toEqual({
      url: 'https://oauth.test',
    });
    expect(oauth.createAuthorizationUrl).toHaveBeenCalledWith(
      'second-account-id',
    );
  });
});
