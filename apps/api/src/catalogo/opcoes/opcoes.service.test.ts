import { describe, expect, it } from 'vitest';

import type { DadosSubespecialidade } from '../listas/lista.repository';
import {
  InMemoryClientesRepository,
  InMemoryContratadosRepository,
  InMemoryExamesRepository,
  InMemoryListaRepository,
} from '../testing/fakes';
import { OpcoesService } from './opcoes.service';

const base = { descricao: null, cor: '#123456', ordem: 0 };

describe('OpcoesService', () => {
  it('devolve só os itens ativos de cada lista, com id, nome e cor', async () => {
    const modalidades = new InMemoryListaRepository();
    await modalidades.criar({ ...base, nome: 'CT', ativo: true });
    await modalidades.criar({ ...base, nome: 'XX', ativo: false });
    const especialidades = new InMemoryListaRepository();
    const neuro = await especialidades.criar({ ...base, nome: 'NEURO', ativo: true });
    const subespecialidades = new InMemoryListaRepository<DadosSubespecialidade>();
    await subespecialidades.criar({ ...base, nome: 'AVC', ativo: true, especialidadeIds: [neuro] });
    const contratados = new InMemoryContratadosRepository();
    await contratados.criar({
      razaoSocial: 'TELE',
      cnpj: null,
      endereco: null,
      cidade: null,
      uf: null,
      cep: null,
      contratadoRepasseId: null,
      ativo: true,
      padrao: true,
      usaFinanceiro: false,
    });

    const service = new OpcoesService(
      {
        modalidades,
        especialidades,
        subespecialidades,
        categoriasExame: new InMemoryListaRepository(),
        prioridades: new InMemoryListaRepository(),
      },
      contratados,
      new InMemoryExamesRepository(),
      new InMemoryClientesRepository(contratados),
    );
    const opcoes = await service.listas();

    expect(opcoes.modalidades).toEqual([{ id: expect.any(String), nome: 'CT', cor: '#123456' }]);
    expect(opcoes.subespecialidades).toEqual([
      { id: expect.any(String), nome: 'AVC', cor: '#123456', especialidadeIds: [neuro] },
    ]);
    expect(opcoes.contratados).toEqual([{ id: expect.any(String), nome: 'TELE', padrao: true }]);
  });

  it('busca até 20 exames ativos pelo nome', async () => {
    const exames = new InMemoryExamesRepository();
    for (let i = 0; i < 25; i++) {
      await exames.criar({
        nome: `TC ${String(i).padStart(2, '0')}`,
        chaveNormalizada: '',
        codigo: null,
        descricao: null,
        modalidadeId: null,
        especialidadeId: null,
        subespecialidadeId: null,
        categoriaId: null,
        prioridadeId: null,
        permiteQuebra: false,
        exigeRevisaoManual: false,
        ativo: true,
      });
    }
    const vazia = new InMemoryListaRepository();
    const service = new OpcoesService(
      {
        modalidades: vazia,
        especialidades: vazia,
        subespecialidades: vazia as never,
        categoriasExame: vazia,
        prioridades: vazia,
      },
      new InMemoryContratadosRepository(),
      exames,
      new InMemoryClientesRepository(new InMemoryContratadosRepository()),
    );

    const achados = await service.exames('tc');

    expect(achados).toHaveLength(20);
    expect(achados[0]).toEqual({ id: expect.any(String), nome: 'TC 00', modalidade: null });
  });

  it('busca até 20 clientes ativos pelo nome, com o nome fantasia', async () => {
    const contratados = new InMemoryContratadosRepository();
    const clientes = new InMemoryClientesRepository(contratados);
    const cliente = (nome: string, ativo = true) => ({
      nome,
      chaveNormalizada: nome.toLowerCase(),
      nomeFantasia: nome === 'CLINIMAGEM' ? 'Clinimagem Centro' : null,
      razaoSocial: null,
      tipoPessoa: null,
      cnpj: null,
      cpf: null,
      contratadoId: null,
      ativo,
      ocultoDashboards: false,
      observacoes: null,
    });
    await clientes.criar(cliente('CLINIMAGEM') as never);
    await clientes.criar(cliente('CLINICA VELHA', false) as never);
    const vazia = new InMemoryListaRepository();
    const service = new OpcoesService(
      {
        modalidades: vazia,
        especialidades: vazia,
        subespecialidades: vazia as never,
        categoriasExame: vazia,
        prioridades: vazia,
      },
      contratados,
      new InMemoryExamesRepository(),
      clientes,
    );

    expect(await service.clientes('clin')).toEqual([
      { id: expect.any(String), nome: 'CLINIMAGEM', nomeFantasia: 'Clinimagem Centro' },
    ]);
  });
});
