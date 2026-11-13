import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ErroDeDominio, type TipoErro } from './erro-de-dominio';
import { ErroDeDominioFilter } from './erro-de-dominio.filter';

class ErroDeTeste extends ErroDeDominio {
  constructor(readonly tipo: TipoErro) {
    super('Mensagem para a pessoa.', { totalUsuarios: 2 });
  }
}

function capturar(erro: ErroDeDominio) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  new ErroDeDominioFilter().catch(erro, host);
  return { status, json };
}

describe('ErroDeDominioFilter', () => {
  it.each([
    ['nao_encontrado', 404],
    ['conflito', 409],
    ['invalido', 400],
    ['proibido', 403],
  ] as const)('erro do tipo %s vira HTTP %i com a mensagem e os detalhes', (tipo, codigo) => {
    const { status, json } = capturar(new ErroDeTeste(tipo));

    expect(status).toHaveBeenCalledWith(codigo);
    expect(json).toHaveBeenCalledWith({
      statusCode: codigo,
      message: 'Mensagem para a pessoa.',
      totalUsuarios: 2,
    });
  });
});
