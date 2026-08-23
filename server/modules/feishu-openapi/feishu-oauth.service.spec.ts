import type { PostgresJsDatabase } from '@lark-apaas/nestjs-datapaas';
import type { FeishuOAuthToken } from './feishu-openapi.client';
import type { FeishuOpenApiClient } from './feishu-openapi.client';
import { FeishuOAuthService } from './feishu-oauth.service';

describe('FeishuOAuthService account binding', () => {
  const originalEncryptionKey = process.env.FEISHU_TOKEN_ENCRYPTION_KEY;
  const originalAppId = process.env.FEISHU_APP_ID;

  afterEach(() => {
    if (originalEncryptionKey === undefined) {
      delete process.env.FEISHU_TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.FEISHU_TOKEN_ENCRYPTION_KEY = originalEncryptionKey;
    }
    if (originalAppId === undefined) {
      delete process.env.FEISHU_APP_ID;
    } else {
      process.env.FEISHU_APP_ID = originalAppId;
    }
  });

  it('stores the authorized token under the signed Miaoda account ID', async () => {
    process.env.FEISHU_TOKEN_ENCRYPTION_KEY = 'oauth-service-test-key';
    process.env.FEISHU_APP_ID = 'current-app-id';
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
      expect.objectContaining({
        userId: 'miaoda-account-id',
        appId: 'current-app-id',
      }),
    );
  });

  it('rejects a token issued by a different Feishu app', async () => {
    process.env.FEISHU_APP_ID = 'current-app-id';
    const limit = jest.fn().mockResolvedValue([
      {
        appId: 'previous-app-id',
        encryptedAccessToken: 'encrypted-access-token',
        encryptedRefreshToken: 'encrypted-refresh-token',
        accessExpiresAt: Date.now() + 3_600_000,
        refreshExpiresAt: Date.now() + 86_400_000,
        scope: 'drive:drive',
      },
    ]);
    const where = jest.fn().mockReturnValue({ limit });
    const from = jest.fn().mockReturnValue({ where });
    const select = jest.fn().mockReturnValue({ from });
    const service = new FeishuOAuthService(
      {} as FeishuOpenApiClient,
      { select } as unknown as PostgresJsDatabase,
    );

    await expect(service.hasAuthorization('miaoda-account-id')).resolves.toBe(
      false,
    );
    await expect(
      service.getAccessToken('miaoda-account-id'),
    ).rejects.toThrow('需要先完成飞书用户授权');
  });
});
