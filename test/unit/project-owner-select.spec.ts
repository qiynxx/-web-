import {
  projectOwnersToUsers,
  usersToProjectOwners,
} from '../../client/src/pages/project-graph/project-owner-select';

describe('project owner select mapping', () => {
  it('keeps name-only Base owners visible in the detail selector', () => {
    const users = projectOwnersToUsers([
      { apaasUserId: '', name: '罗汉斌' },
      { apaasUserId: '', name: '魏效田' },
    ]);

    expect(users.map((user) => user.name)).toEqual(['罗汉斌', '魏效田']);
    expect(users.every((user) => Boolean(user.user_id))).toBe(true);
  });

  it('preserves name-only owners when the selector value changes', () => {
    const existingUsers = projectOwnersToUsers([
      { apaasUserId: '', name: '罗汉斌' },
    ]);

    const owners = usersToProjectOwners([
      ...existingUsers,
      {
        user_id: '1870110384934055',
        larkUserId: '7659972143161052396',
        name: '曾启渊',
      },
    ]);

    expect(owners).toEqual([
      {
        apaasUserId: '',
        openId: undefined,
        larkUserId: undefined,
        name: '罗汉斌',
        avatar: undefined,
        email: undefined,
      },
      {
        apaasUserId: '1870110384934055',
        openId: undefined,
        larkUserId: '7659972143161052396',
        name: '曾启渊',
        avatar: undefined,
        email: undefined,
      },
    ]);
  });
});
