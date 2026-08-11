import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FeishuOAuthService } from './feishu-oauth.service';

@Controller('oauth/feishu')
export class FeishuOAuthCallbackController {
  constructor(private readonly oauth: FeishuOAuthService) {}

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') authorizationError: string,
    @Res() response: Response,
  ): Promise<void> {
    if (!state) {
      throw new BadRequestException('飞书 OAuth 回调缺少 state');
    }
    if (authorizationError) {
      response
        .status(400)
        .type('html')
        .send(
          authorizationResultPage(
            'feishu-oauth-failed',
            authorizationError === 'access_denied'
              ? '你已取消飞书授权'
              : '飞书授权失败，请重试',
          ),
        );
      return;
    }
    if (!code) {
      throw new BadRequestException('飞书 OAuth 回调缺少 code');
    }
    try {
      await this.oauth.completeAuthorization(code, state);
      response
        .type('html')
        .send(
          authorizationResultPage(
            'feishu-oauth-complete',
            '飞书授权已完成，正在创建项目，请勿关闭此窗口。',
          ),
        );
    } catch (error: unknown) {
      const message =
        error instanceof HttpException
          ? String(error.getResponse() instanceof Object
              ? (error.getResponse() as { message?: unknown }).message ??
                  error.message
              : error.getResponse())
          : error instanceof Error
            ? error.message
            : '飞书授权失败';
      response
        .status(error instanceof HttpException ? error.getStatus() : 500)
        .type('html')
        .send(authorizationResultPage('feishu-oauth-failed', message));
    }
  }
}

function authorizationResultPage(type: string, message: string): string {
  const payload = JSON.stringify({ type, message }).replace(/</g, '\\u003c');
  const content = escapeHtml(message);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>飞书授权</title></head><body><p>${content}</p><script>if(window.opener){window.opener.postMessage(${payload},window.location.origin)}</script></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
