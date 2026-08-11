import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { FeishuOAuthService } from './feishu-oauth.service';

@Controller('oauth/feishu')
export class FeishuOAuthCallbackController {
  constructor(private readonly oauth: FeishuOAuthService) {}

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() response: Response,
  ): Promise<void> {
    if (!code || !state) {
      throw new BadRequestException('飞书 OAuth 回调缺少 code 或 state');
    }
    await this.oauth.completeAuthorization(code, state);
    response
      .type('html')
      .send(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>飞书授权完成</title></head><body><p>飞书授权已完成，正在创建项目，请勿关闭此窗口。</p><script>if(window.opener){window.opener.postMessage({type:'feishu-oauth-complete'},window.location.origin)}</script></body></html>`);
  }
}
