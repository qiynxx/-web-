import { Module } from '@nestjs/common';
import { FeishuBaseClient } from './feishu-base.client';
import { FeishuOAuthCallbackController } from './feishu-oauth-callback.controller';
import { FeishuOAuthController } from './feishu-oauth.controller';
import { FeishuOAuthService } from './feishu-oauth.service';
import { FeishuOpenApiClient } from './feishu-openapi.client';

@Module({
  controllers: [FeishuOAuthController, FeishuOAuthCallbackController],
  providers: [FeishuOpenApiClient, FeishuOAuthService, FeishuBaseClient],
  exports: [FeishuOpenApiClient, FeishuOAuthService, FeishuBaseClient],
})
export class FeishuOpenApiModule {}
