import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('é só forma: fica fora da leitura de tela e aceita o tamanho de quem usa', () => {
    const { container } = render(<Skeleton className="h-9 w-40" />);

    const bloco = container.firstElementChild;
    expect(bloco).toHaveAttribute('aria-hidden', 'true');
    expect(bloco).toHaveClass('h-9', 'w-40');
  });
});
