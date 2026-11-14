import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('mostra as iniciais do nome, escondidas do leitor de tela (o nome já está ao lado)', () => {
    const { container } = render(<Avatar nome="Maria da Souza" tamanho="md" />);

    const avatar = container.firstElementChild;
    expect(avatar).toHaveTextContent('MS');
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
  });
});
