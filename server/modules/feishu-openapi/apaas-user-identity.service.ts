import { ForbiddenException, Injectable } from '@nestjs/common';
import { RequestContextService } from '@lark-apaas/nestjs-common';

@Injectable()
export class ApaasUserIdentityService {
  constructor(private readonly requestContext: RequestContextService) {}

  requireAccountId(): string {
    const accountId = this.requestContext.get('userId');
    if (typeof accountId !== 'string' || !accountId.trim()) {
      throw new ForbiddenException('无法识别当前妙搭用户');
    }
    return accountId;
  }
}
