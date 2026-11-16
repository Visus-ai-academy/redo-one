import { describe, expect, it } from 'vitest';

import { AvisoNaoEncontradoError } from '../erros';
import type { ConsultaAvisos } from '../ports/avisos.consulta';
import { ListarAvisos } from './consultas-simples';

describe('ListarAvisos', () => {
  it('aviso que não existe é erro de não encontrado', async () => {
    const consulta = { obter: async () => null } as unknown as ConsultaAvisos;
    await expect(new ListarAvisos(consulta).obter('x')).rejects.toThrow(AvisoNaoEncontradoError);
  });
});
