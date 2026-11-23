import { describe, expect, it } from 'vitest';

import { Route } from './__root';

describe('head da raiz', () => {
  it('aponta o favicon e o ícone do iOS', async () => {
    const head = await Route.options.head?.({} as never);

    expect(head?.links).toEqual(
      expect.arrayContaining([
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ]),
    );
  });
});
