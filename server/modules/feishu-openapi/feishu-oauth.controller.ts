import { Controller, Get } from '@nestjs/common';
import { NeedLogin, AuthNPaasService } from '@lark-apaas/fullstack-nestjs-core';
import { FeishuOAuthService } from './feishu-oauth.service';

@Controller('api/feishu-oauth')
export class FeishuOAuthController {
  constructor(
    private readonly oauth: FeishuOAuthService,
    private readonly authn: AuthNPaasService,
  ) {}

  @NeedLogin()
  @Get('status')
  async status(): Promise<{ authorized: boolean }> {
    const userId = await this.requireUserId();
    return { authorized: await this.oauth.hasAuthorization(userId) };
  }

  @NeedLogin()
  @Get('authorize')
  async authorize(): Promise<{ url: string }> {
    const userId = await this.requireUserId();
    return { url: this.oauth.createAuthorizationUrl(userId) };
  }

  private async requireUserId(): Promise<string> {
    const userId = await this.authn.getCurrentUserLarkUserId();
    if (!userId) throw new Error('无法识别当前飞书用户');
    return userId;
  }
}
