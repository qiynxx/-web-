import type { PostgresJsDatabase } from '@lark-apaas/nestjs-datapaas';
import type { FeishuOAuthToken } from './feishu-openapi.client';
import type { FeishuOpenApiClient } from './feishu-openapi.client';
import { FeishuOAuthService } from './feishu-oauth.service';

describe('FeishuOAuthService account binding', () => {
  const originalEncryptionKey = process.env.FEISHU_TOKEN_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalEncryptionKey === undefined) {
      delete process.env.FEISHU_TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.FEISHU_TOKEN_ENCRYPTION_KEY = originalEncryptionKey;
    }
  });

  it('stores the authorized token under the signed Miaoda account ID', async () => {
    process.env.FEISHU_TOKEN_ENCRYPTION_KEY = 'oauth-service-test-key';
    const token: FeishuOAuthToken = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      refreshExpiresIn: 86400,
      scope: 'drive:drive',
    };
    const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = jest.fn().mockReturnValue({ values });
    const openApi = {
      buildAuthorizationUrl: jest.fn(
        (state: string) =>
          `https://oauth.test/authorize?state=${encodeURIComponent(state)}`,
      ),
      exchangeAuthorizationCode: jest.fn().mockResolvedValue(token),
    } as unknown as FeishuOpenApiClient;
    const service = new FeishuOAuthService(openApi, {
      insert,
    } as unknown as PostgresJsDatabase);

    const authorizationUrl =
      service.createAuthorizationUrl('miaoda-account-id');
    const state = new URL(authorizationUrl).searchParams.get('state');
    expect(state).toBeTruthy();
    await expect(
      service.completeAuthorization('authorization-code', state!),
    ).resolves.toBe('miaoda-account-id');

    expect(openApi.exchangeAuthorizationCode).toHaveBeenCalledWith(
      'authorization-code',
    );
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'miaoda-account-id' }),
    );
  });
});
