import { Controller, Get } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { ApaasUserIdentityService } from './apaas-user-identity.service';
import { FeishuOAuthService } from './feishu-oauth.service';

@Controller('api/feishu-oauth')
export class FeishuOAuthController {
  constructor(
    private readonly oauth: FeishuOAuthService,
    private readonly userIdentity: ApaasUserIdentityService,
  ) {}

  @NeedLogin()
  @Get('status')
  async status(): Promise<{ authorized: boolean }> {
    const accountId = this.userIdentity.requireAccountId();
    return { authorized: await this.oauth.hasAuthorization(accountId) };
  }

  @NeedLogin()
  @Get('authorize')
  async authorize(): Promise<{ url: string }> {
    const accountId = this.userIdentity.requireAccountId();
    return { url: this.oauth.createAuthorizationUrl(accountId) };
  }
}
