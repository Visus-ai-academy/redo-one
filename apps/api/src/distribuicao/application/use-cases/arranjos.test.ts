import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import {
  ArranjosEmMemoria,
  arranjoVazio,
  CadastrosEmMemoria,
  PrioridadesOperacaoEmMemoria,
} from '../../testing/fakes';
import {
  ArranjosInvalidosError,
  EquipeNaoEncontradaError,
  MedicoNaoEncontradoError,
} from '../erros';
import { ConsultarArranjos, SalvarArranjos } from './arranjos';

const agora = new Date('2026-11-17T18:00:00Z');
const ator = { tipo: 'usuario' as const, id: 'u1' };

describe('arranjos', () => {
  let repo: ArranjosEmMemoria;
  let cadastros: CadastrosEmMemoria;
  let auditoria: InMemoryAuditoria;
  let prioridades: PrioridadesOperacaoEmMemoria;
  let consultar: ConsultarArranjos;
  let salvar: SalvarArranjos;

  beforeEach(() => {
    repo = new ArranjosEmMemoria();
    cadastros = new CadastrosEmMemoria();
    cadastros.medicos.add('m1');
    cadastros.equipes.add('e1');
    auditoria = new InMemoryAuditoria();
    prioridades = new PrioridadesOperacaoEmMemoria();
    consultar = new ConsultarArranjos(repo, cadastros, prioridades);
    salvar = new SalvarArranjos(repo, cadastros, auditoria, () => agora);
  });

  it('consulta os arranjos do médico com os nomes dos clientes e exames marcados e as prioridades da operação', async () => {
    const base = {
      urgencia: { tipo: 'nunca' as const },
      furaGradeNaAlocacao: false,
      padrao: false,
      grafias: [],
    };
    await prioridades.salvar({ id: 'op-rot', nome: 'ROTINA', posicao: 3, cor: '#5A9A64', ...base });
    await prioridades.salvar({ id: 'op-urg', nome: 'URGÊNCIA', posicao: 1, cor: null, ...base });
    cadastros.nomes.set('c1', 'CLINIMAGEM');
    cadastros.nomes.set('x1', 'TC CRANIO');
    const lista = [
      arranjoVazio({
        modoClientes: 'apenas',
        clienteIds: ['c1'],
        clientesExclusivosIds: ['c1'],
        modoExames: 'exceto',
        exameIds: ['x1'],
      }),
    ];
    repo.porDono.set('medico:m1', lista);
    expect(await consultar.executar({ tipo: 'medico', id: 'm1' })).toEqual({
      arranjos: lista,
      clientes: [{ id: 'c1', nome: 'CLINIMAGEM' }],
      exames: [{ id: 'x1', nome: 'TC CRANIO' }],
      prioridades: [
        { id: 'op-urg', nome: 'URGÊNCIA', cor: null },
        { id: 'op-rot', nome: 'ROTINA', cor: '#5A9A64' },
      ],
    });
  });

  it('médico ou equipe inexistente dá não encontrado', async () => {
    await expect(consultar.executar({ tipo: 'medico', id: 'x' })).rejects.toThrow(
      MedicoNaoEncontradoError,
    );
    await expect(salvar.executar(ator, { tipo: 'equipe', id: 'x' }, [])).rejects.toThrow(
      EquipeNaoEncontradaError,
    );
  });

  it('salva a lista e audita antes e depois', async () => {
    const novos = [arranjoVazio({ especialidadeId: 'neuro', prioridadeIds: ['rotina'] })];
    await salvar.executar(ator, { tipo: 'medico', id: 'm1' }, novos);
    expect(repo.porDono.get('medico:m1')).toEqual(novos);
    expect(auditoria.eventos).toEqual([
      {
        ator,
        entidade: 'arranjos_medico',
        entidadeId: 'm1',
        acao: 'alterado',
        antes: { arranjos: [] },
        depois: { arranjos: novos },
        em: agora,
      },
    ]);
  });

  it('recusa prioridade que não é da operação (o recorte é pelas da operação, 19/11/2026)', async () => {
    cadastros.existentes.set('prioridadeOperacao', new Set(['op-rotina']));
    await expect(
      salvar.executar(ator, { tipo: 'medico', id: 'm1' }, [
        arranjoVazio({ prioridadeIds: ['pri-rotina-do-catalogo'] }),
      ]),
    ).rejects.toThrow(/Prioridade da operação não encontrada/);
    expect(repo.porDono.get('medico:m1')).toBeUndefined();
  });

  it('na equipe, audita como arranjos_equipe', async () => {
    await salvar.executar(ator, { tipo: 'equipe', id: 'e1' }, [arranjoVazio()]);
    expect(auditoria.eventos[0]?.entidade).toBe('arranjos_equipe');
  });

  it('sem mudança, não grava nem audita (a ordem das listas não conta)', async () => {
    repo.porDono.set('medico:m1', [arranjoVazio({ modalidadeIds: ['ct', 'mr'] })]);
    await salvar.executar(ator, { tipo: 'medico', id: 'm1' }, [
      arranjoVazio({ modalidadeIds: ['mr', 'ct'] }),
    ]);
    expect(repo.substituicoes).toBe(0);
    expect(auditoria.eventos).toEqual([]);
  });

  it('recusa arranjo inválido sem gravar', async () => {
    await expect(
      salvar.executar(ator, { tipo: 'equipe', id: 'e1' }, [
        arranjoVazio({ clientesExclusivosIds: ['c1'] }),
      ]),
    ).rejects.toThrow(ArranjosInvalidosError);
    expect(repo.substituicoes).toBe(0);
  });

  describe('segmento da especialidade', () => {
    const dono = { tipo: 'medico' as const, id: 'm1' };
    beforeEach(() => {
      cadastros.segmentosCadastrados.push(
        { id: 's-avc', nome: 'AVC', especialidadeIds: ['e-neuro'] },
        { id: 's-colunas', nome: 'COLUNAS', especialidadeIds: ['e-neuro', 'e-msk'] },
      );
    });

    it('recusa segmento que a especialidade do arranjo não tem, sem gravar', async () => {
      await expect(
        salvar.executar(ator, dono, [
          arranjoVazio({ especialidadeId: 'e-msk', subespecialidadeIds: ['s-colunas', 's-avc'] }),
        ]),
      ).rejects.toThrow(
        new ArranjosInvalidosError(
          'O segmento AVC não existe na especialidade do arranjo. Escolha um segmento dela ou deixe sem segmento.',
        ),
      );
      expect(repo.substituicoes).toBe(0);
    });

    it('arranjo sem especialidade (todas) aceita qualquer segmento', async () => {
      await salvar.executar(ator, dono, [arranjoVazio({ subespecialidadeIds: ['s-avc'] })]);
      expect(repo.substituicoes).toBe(1);
    });

    it('não barra arranjo já gravado fora da regra que segue igual', async () => {
      const antigo = arranjoVazio({ especialidadeId: 'e-msk', subespecialidadeIds: ['s-avc'] });
      repo.porDono.set('medico:m1', [antigo]);

      await salvar.executar(ator, dono, [
        antigo,
        arranjoVazio({ especialidadeId: 'e-neuro', subespecialidadeIds: ['s-avc'] }),
      ]);

      expect(repo.substituicoes).toBe(1);
    });
  });
});
