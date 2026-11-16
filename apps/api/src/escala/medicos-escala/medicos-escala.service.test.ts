import { describe, expect, it } from 'vitest';

import type { Pagina } from '../../catalogo/comum/paginacao';
import { MedicoEscalaNaoEncontradoError } from './medicos-escala.errors';
import type {
  FiltroMedicosEscala,
  MedicoEscala,
  MedicosEscalaRepository,
} from './medicos-escala.repository';
import { MedicosEscalaService } from './medicos-escala.service';

class FakeMedicosEscalaRepository implements MedicosEscalaRepository {
  filtros: FiltroMedicosEscala[] = [];

  constructor(private readonly medicos: MedicoEscala[]) {}

  async listar(filtro: FiltroMedicosEscala): Promise<Pagina<MedicoEscala>> {
    this.filtros.push(filtro);
    return { itens: this.medicos, total: this.medicos.length };
  }

  async buscar(id: string) {
    return this.medicos.find((m) => m.id === id) ?? null;
  }
}

const ana: MedicoEscala = { id: 'm-ana', nome: 'Dra. Ána Reis', ativo: true };

describe('MedicosEscalaService', () => {
  it('normaliza a busca (sem acento, maiúscula nem "Dr.") antes de consultar', async () => {
    const repo = new FakeMedicosEscalaRepository([ana]);
    const service = new MedicosEscalaService(repo);

    const pagina = await service.listar({
      busca: 'Dra. ÁNA',
      ativo: true,
      pagina: 2,
      porPagina: 10,
    });

    expect(repo.filtros).toEqual([{ busca: 'ana', ativo: true, pagina: 2, porPagina: 10 }]);
    expect(pagina).toEqual({ itens: [ana], total: 1 });
  });

  it('sem busca nem situação, não filtra', async () => {
    const repo = new FakeMedicosEscalaRepository([]);
    await new MedicosEscalaService(repo).listar({ busca: '  ', pagina: 1, porPagina: 25 });

    expect(repo.filtros).toEqual([{ pagina: 1, porPagina: 25 }]);
  });

  it('busca sem letras não acha ninguém (não devolve a lista inteira)', async () => {
    const repo = new FakeMedicosEscalaRepository([ana]);
    const pagina = await new MedicosEscalaService(repo).listar({
      busca: '123',
      pagina: 1,
      porPagina: 25,
    });

    expect(pagina).toEqual({ itens: [], total: 0 });
    expect(repo.filtros).toEqual([]);
  });

  it('obtém o médico pelo id', async () => {
    const service = new MedicosEscalaService(new FakeMedicosEscalaRepository([ana]));
    await expect(service.obter('m-ana')).resolves.toEqual(ana);
  });

  it('id inexistente é não encontrado', async () => {
    const service = new MedicosEscalaService(new FakeMedicosEscalaRepository([ana]));
    await expect(service.obter('m-x')).rejects.toThrow(MedicoEscalaNaoEncontradoError);
  });
});
