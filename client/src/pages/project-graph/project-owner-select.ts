import type { ProjectOwner } from '@shared/api.interface';
import type { User } from '../../components/business-ui/types/user';
import { getI18nText } from '../../components/business-ui/utils/user';

const OWNER_NAME_ID_PREFIX = '__project_owner_name__:';

function ownerNameId(name: string): string {
  return `${OWNER_NAME_ID_PREFIX}${encodeURIComponent(name)}`;
}

function readOwnerNameId(userId: string): string {
  if (!userId.startsWith(OWNER_NAME_ID_PREFIX)) return '';
  return decodeURIComponent(userId.slice(OWNER_NAME_ID_PREFIX.length));
}

export function projectOwnersToUsers(owners: ProjectOwner[]): User[] {
  return owners.flatMap((owner) => {
    const name = owner.name.trim();
    const userId = owner.apaasUserId.trim() || (name ? ownerNameId(name) : '');
    if (!userId) return [];

    return [
      {
        user_id: userId,
        larkUserId: owner.openId ?? owner.larkUserId,
        name: name || '未知用户',
        avatar: owner.avatar,
        email: owner.email,
      },
    ];
  });
}

export function usersToProjectOwners(users: User[]): ProjectOwner[] {
  return users.flatMap((user) => {
    const userId = String(user.user_id ?? '').trim();
    if (!userId) return [];

    const fallbackName = readOwnerNameId(userId);
    const name = getI18nText(user.name).trim() || fallbackName || '未知用户';
    const isNameOnlyOwner = Boolean(fallbackName);
    const larkIdentifier = user.larkUserId || undefined;

    return [
      {
        apaasUserId: isNameOnlyOwner ? '' : userId,
        openId: larkIdentifier?.startsWith('ou_') ? larkIdentifier : undefined,
        larkUserId: larkIdentifier?.startsWith('ou_')
          ? undefined
          : larkIdentifier,
        name,
        avatar: user.avatar,
        email: user.email,
      },
    ];
  });
}
