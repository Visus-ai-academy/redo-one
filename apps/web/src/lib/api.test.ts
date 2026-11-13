import { describe, expect, it } from 'vitest';

import { client } from '../gen/.kubb/client';
import { configurarApi } from './api';

describe('configurarApi', () => {
  it('envia o cookie da sessão em toda chamada à API', () => {
    configurarApi();

    expect(client.getConfig().credentials).toBe('include');
  });
});
