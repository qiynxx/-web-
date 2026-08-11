import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';

interface FeishuEnvelope<T> {
  code: number;
  msg: string;
  data?: T;
}

export interface FeishuOAuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  scope: string;
  openId?: string;
}

@Injectable()
export class FeishuOpenApiClient {
  private readonly logger = new Logger(FeishuOpenApiClient.name);
  private readonly baseUrl = 'https://open.feishu.cn';

  buildAuthorizationUrl(state: string): string {
    const appId = this.requiredEnv('FEISHU_APP_ID');
    const redirectUri = this.requiredEnv('FEISHU_OAUTH_REDIRECT_URI');
    const query = new URLSearchParams({
      client_id: appId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
      scope: [
        'offline_access',
        'auth:user.id:read',
        'base:app:create',
        'base:app:read',
        'base:app:update',
        'base:table:create',
        'base:table:read',
        'base:field:create',
        'base:field:read',
        'base:view:write_only',
        'base:view:read',
        'base:record:create',
        'base:record:read',
        'base:record:update',
        'base:record:delete',
        'drive:drive',
      ].join(' '),
    });
    return `https://accounts.feishu.cn/open-apis/authen/v1/authorize?${query.toString()}`;
  }

  async exchangeAuthorizationCode(code: string): Promise<FeishuOAuthToken> {
    return this.requestOAuthToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.requiredEnv('FEISHU_OAUTH_REDIRECT_URI'),
    });
  }

  async refreshUserToken(refreshToken: string): Promise<FeishuOAuthToken> {
    return this.requestOAuthToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  async getCurrentUser(accessToken: string): Promise<{ userId: string }> {
    const data = await this.request<{ user_id?: string }>(accessToken, {
      method: 'GET',
      url: '/open-apis/authen/v1/user_info',
    });
    if (!data.user_id) {
      throw new UnauthorizedException('飞书授权未返回 user_id');
    }
    return { userId: data.user_id };
  }

  async request<T>(
    accessToken: string,
    config: AxiosRequestConfig,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await axios.request<FeishuEnvelope<T>>({
          ...config,
          baseURL: this.baseUrl,
          timeout: 15_000,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=utf-8',
            ...config.headers,
          },
        });
        if (response.data.code !== 0) {
          throw new BadRequestException(
            `飞书 OpenAPI 调用失败 (${response.data.code}): ${response.data.msg}`,
          );
        }
        return (response.data.data ?? {}) as T;
      } catch (error: unknown) {
        lastError = error;
        if (!this.isRetryable(error) || attempt === 2) break;
        await delay(250 * 2 ** attempt);
      }
    }
    throw this.normalizeError(lastError);
  }

  private async requestOAuthToken(
    grant: Record<string, string>,
  ): Promise<FeishuOAuthToken> {
    try {
      const response = await axios.post<
        FeishuEnvelope<{
          access_token: string;
          refresh_token: string;
          expires_in: number;
          refresh_expires_in?: number;
          refresh_token_expires_in?: number;
          scope?: string;
          open_id?: string;
        }> & {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          refresh_expires_in?: number;
          refresh_token_expires_in?: number;
          scope?: string;
          open_id?: string;
          message?: string;
        }
      >(
        'https://accounts.feishu.cn/oauth/v3/token',
        {
          ...grant,
          client_id: this.requiredEnv('FEISHU_APP_ID'),
          client_secret: this.requiredEnv('FEISHU_APP_SECRET'),
        },
        { timeout: 15_000 },
      );
      const body = response.data;
      const data = body.data ?? body;
      if (!data.access_token || !data.refresh_token) {
        throw new UnauthorizedException(
          `飞书用户授权失败 (${body.code ?? 'unknown'}): ${
            body.msg || body.message || '未返回 token'
          }`,
        );
      }
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in ?? 0,
        refreshExpiresIn:
          data.refresh_expires_in ?? data.refresh_token_expires_in ?? 0,
        scope: data.scope ?? '',
        openId: data.open_id,
      };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw error;
      throw this.normalizeError(error, true);
    }
  }

  private requiredEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
      throw new BadRequestException(`服务端缺少环境变量 ${name}`);
    }
    return value;
  }

  private isRetryable(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    const code = Number(
      (error.response?.data as { code?: unknown } | undefined)?.code,
    );
    return (
      status === 429 ||
      Boolean(status && status >= 500) ||
      code === 1254291 ||
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT'
    );
  }

  private normalizeError(error: unknown, oauth = false): Error {
    if (
      error instanceof BadRequestException ||
      error instanceof UnauthorizedException
    ) {
      return error;
    }
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{
        code?: number;
        msg?: string;
        message?: string;
        error?: string;
        error_description?: string;
      }>;
      const status = axiosError.response?.status;
      const body = axiosError.response?.data;
      const message =
        body?.error_description ||
        body?.msg ||
        body?.message ||
        body?.error ||
        axiosError.message;
      this.logger.error(
        JSON.stringify({
          method: axiosError.config?.method,
          path: axiosError.config?.url,
          status,
          feishuCode: body?.code,
          message,
        }),
      );
      if (status === 401 || status === 403 || oauth) {
        return new UnauthorizedException(`飞书授权无效: ${message}`);
      }
      return new BadGatewayException(`飞书 OpenAPI 请求失败: ${message}`);
    }
    return new BadGatewayException(
      `飞书 OpenAPI 请求失败: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
