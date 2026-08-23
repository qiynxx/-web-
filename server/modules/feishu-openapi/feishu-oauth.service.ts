import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/nestjs-datapaas';
import { eq } from 'drizzle-orm';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'crypto';
import { feishuOAuthToken } from '@server/database/project-storage.schema';
import type { FeishuOAuthToken } from './feishu-openapi.client';
import { FeishuOpenApiClient } from './feishu-openapi.client';

interface StoredToken {
  appId: string | null;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
  scope: string;
}

@Injectable()
export class FeishuOAuthService {
  constructor(
    private readonly openApi: FeishuOpenApiClient,
    @Optional()
    @Inject(DRIZZLE_DATABASE)
    private readonly db?: PostgresJsDatabase,
  ) {}

  createAuthorizationUrl(accountId: string): string {
    return this.openApi.buildAuthorizationUrl(this.createState(accountId));
  }

  async completeAuthorization(code: string, state: string): Promise<string> {
    const accountId = this.verifyState(state);
    const token = await this.openApi.exchangeAuthorizationCode(code);
    await this.storeToken(accountId, token);
    return accountId;
  }

  async hasAuthorization(accountId: string): Promise<boolean> {
    const token = await this.findToken(accountId);
    return Boolean(
      token &&
      token.appId === this.currentAppId() &&
      token.refreshExpiresAt > Date.now() &&
      token.scope.split(/\s+/).includes('drive:drive'),
    );
  }

  async getAccessToken(accountId: string): Promise<string> {
    const stored = await this.findToken(accountId);
    if (
      !stored ||
      stored.appId !== this.currentAppId() ||
      stored.refreshExpiresAt <= Date.now()
    ) {
      throw new UnauthorizedException('需要先完成飞书用户授权');
    }
    if (stored.accessExpiresAt > Date.now() + 60_000) {
      return this.decrypt(stored.encryptedAccessToken);
    }
    const refreshed = await this.openApi.refreshUserToken(
      this.decrypt(stored.encryptedRefreshToken),
    );
    await this.storeToken(accountId, refreshed);
    return refreshed.accessToken;
  }

  async getAuthorizedLarkUserId(accountId: string): Promise<string> {
    const accessToken = await this.getAccessToken(accountId);
    const identity = await this.openApi.getCurrentUser(accessToken);
    return identity.userId;
  }

  private async findToken(accountId: string): Promise<StoredToken | undefined> {
    const db = this.requireDatabase();
    const [row] = await db
      .select()
      .from(feishuOAuthToken)
      .where(eq(feishuOAuthToken.userId, accountId))
      .limit(1);
    return row;
  }

  private async storeToken(
    accountId: string,
    token: FeishuOAuthToken,
  ): Promise<void> {
    const now = Date.now();
    const stored: typeof feishuOAuthToken.$inferInsert = {
      userId: accountId,
      appId: this.currentAppId(),
      encryptedAccessToken: this.encrypt(token.accessToken),
      encryptedRefreshToken: this.encrypt(token.refreshToken),
      accessExpiresAt: now + Math.max(0, token.expiresIn - 30) * 1_000,
      refreshExpiresAt: now + Math.max(0, token.refreshExpiresIn - 30) * 1_000,
      scope: token.scope,
      updatedAt: now,
    };
    await this.requireDatabase()
      .insert(feishuOAuthToken)
      .values(stored)
      .onConflictDoUpdate({
        target: feishuOAuthToken.userId,
        set: {
          appId: stored.appId,
          encryptedAccessToken: stored.encryptedAccessToken,
          encryptedRefreshToken: stored.encryptedRefreshToken,
          accessExpiresAt: stored.accessExpiresAt,
          refreshExpiresAt: stored.refreshExpiresAt,
          scope: stored.scope,
          updatedAt: stored.updatedAt,
        },
      });
  }

  private createState(accountId: string): string {
    const issuedAt = Date.now().toString(36);
    const nonce = randomBytes(12).toString('base64url');
    const payload = Buffer.from(`${accountId}\n${issuedAt}\n${nonce}`).toString(
      'base64url',
    );
    return `${payload}.${this.sign(payload)}`;
  }

  private verifyState(state: string): string {
    const [payload, signature] = state.split('.');
    if (!payload || !signature || this.sign(payload) !== signature) {
      throw new BadRequestException('飞书 OAuth state 无效');
    }
    const decoded = Buffer.from(payload, 'base64url').toString();
    const [accountId, issuedAt] = decoded.split('\n');
    const timestamp = Number.parseInt(issuedAt, 36);
    if (
      !accountId ||
      !Number.isFinite(timestamp) ||
      Date.now() - timestamp > 600_000
    ) {
      throw new BadRequestException('飞书 OAuth state 已过期');
    }
    return accountId;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.encryptionKey())
      .update(payload)
      .digest('base64url');
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), ciphertext]
      .map((item) => item.toString('base64url'))
      .join('.');
  }

  private decrypt(value: string): string {
    const [ivText, tagText, ciphertextText] = value.split('.');
    if (!ivText || !tagText || !ciphertextText) {
      throw new UnauthorizedException('飞书授权数据损坏');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(ivText, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private requireDatabase(): PostgresJsDatabase {
    if (!this.db) {
      throw new BadRequestException(
        '妙搭数据库未启用，无法保存飞书 OAuth 授权',
      );
    }
    return this.db;
  }

  private currentAppId(): string {
    const appId = process.env.FEISHU_APP_ID?.trim();
    if (!appId) {
      throw new BadRequestException(
        '服务端缺少环境变量 FEISHU_APP_ID',
      );
    }
    return appId;
  }

  private encryptionKey(): Buffer {
    const secret = process.env.FEISHU_TOKEN_ENCRYPTION_KEY?.trim();
    if (!secret) {
      throw new BadRequestException(
        '服务端缺少环境变量 FEISHU_TOKEN_ENCRYPTION_KEY',
      );
    }
    return createHmac('sha256', 'project-graph-feishu-oauth')
      .update(secret)
      .digest();
  }
}
