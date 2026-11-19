import { describe, expect, it } from 'vitest';

import type {
  ClassificacoesEscala,
  ClassificacoesEscalaRepository,
} from './classificacoes-escala.repository';
import { ClassificacoesEscalaService } from './classificacoes-escala.service';

class FakeClassificacoesEscalaRepository implements ClassificacoesEscalaRepository {
  constructor(private readonly dados: ClassificacoesEscala) {}

  async listar() {
    return this.dados;
  }
}

describe('ClassificacoesEscalaService', () => {
  it('devolve prioridades e subespecialidades, inativas inclusive', async () => {
    const dados: ClassificacoesEscala = {
      prioridades: [
        { id: 'p-urg', nome: 'URGÊNCIA', cor: '#B5535A' },
        { id: 'p-int', nome: 'INTERNADO', cor: null },
      ],
      subespecialidades: [{ id: 's-avc', nome: 'AVC', ativo: true, especialidadeIds: ['e-neuro'] }],
    };
    const service = new ClassificacoesEscalaService(new FakeClassificacoesEscalaRepository(dados));

    await expect(service.listar()).resolves.toEqual(dados);
  });
});
