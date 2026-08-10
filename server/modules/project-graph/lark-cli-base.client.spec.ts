import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  createLarkCliException,
  isNoOperationEnvelope,
  recordsFromMatrix,
} from './lark-cli-base.client';

describe('createLarkCliException', () => {
  it('keeps the Feishu error code and schema hint in a readable 400 response', () => {
    const exception = createLarkCliException({
      code: 800030201,
      message: 'not_found',
      hint: 'List fields in the current table, then retry.',
    });

    expect(exception).toBeInstanceOf(BadRequestException);
    expect(exception.message).toContain('800030201');
    expect(exception.message).toContain('not_found');
    expect(exception.message).toContain('List fields');
  });

  it('maps permission failures to a 403 response', () => {
    const exception = createLarkCliException({
      code: 91403,
      message: 'forbidden',
    });

    expect(exception).toBeInstanceOf(ForbiddenException);
  });
});

describe('isNoOperationEnvelope', () => {
  it('accepts the Feishu no-op response as an idempotent success', () => {
    expect(
      isNoOperationEnvelope({
        ok: false,
        error: { code: 800070003, message: 'no operation produced' },
      }),
    ).toBe(true);
    expect(
      isNoOperationEnvelope({
        ok: false,
        error: { code: 403, message: 'permission denied' },
      }),
    ).toBe(false);
  });
});

describe('recordsFromMatrix', () => {
  it('maps the CLI matrix response to record objects by field name', () => {
    expect(
      recordsFromMatrix({
        fields: ['项目名称', '状态', '整体进度'],
        data: [['ir-slam', ['推进中'], 60]],
        record_id_list: ['rec_project'],
        has_more: false,
      }),
    ).toEqual([
      {
        id: 'rec_project',
        record: {
          项目名称: 'ir-slam',
          状态: ['推进中'],
          整体进度: 60,
        },
      },
    ]);
  });

  it('keeps missing cells as null and does not invent records', () => {
    expect(
      recordsFromMatrix({
        fields: ['标题', '说明'],
        data: [['只有标题']],
        record_id_list: ['rec_one'],
      }),
    ).toEqual([
      {
        id: 'rec_one',
        record: { 标题: '只有标题', 说明: null },
      },
    ]);
    expect(
      recordsFromMatrix({
        fields: ['标题'],
        data: [['没有 ID']],
        record_id_list: [],
      }),
    ).toEqual([]);
  });
});
