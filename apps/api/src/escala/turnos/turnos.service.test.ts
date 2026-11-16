import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import {
  ItemEmUsoError,
  ItemNaoEncontradoError,
  NomeEmUsoError,
  ReferenciaInexistenteError,
} from '../../catalogo/comum/catalogo.errors';
import { FixedClock } from '../../identidade/testing/fakes';
import { ConflitoEscalaError, EscalaInvalidaError } from '../domain/errors';
import { InMemoryTurnosRepository } from './testing';
import type { DadosTurno } from './turno';
import { TurnosService } from './turnos.service';

// 23h de 15/11 em Brasília: "hoje" é 15/11, não 16/11.
const AGORA = new Date('2026-11-16T02:00:00Z');
const ator = { usuarioId: 'u-ana' };

const dados = (extra: Partial<DadosTurno> = {}): DadosTurno => ({
  nome: 'Manhã',
  tipo: 'fixo',
  horarioInicio: '07:00',
  horarioFim: '13:00',
  frenteIds: ['f-neuro', 'f-tc'],
  descricao: null,
  cor: null,
  ordem: 0,
  ativo: true,
  ...extra,
});

describe('TurnosService', () => {
  let repo: InMemoryTurnosRepository;
  let auditoria: InMemoryAuditoria;
  let service: TurnosService;

  beforeEach(() => {
    repo = new InMemoryTurnosRepository();
    repo.frentesExistentes.set('f-neuro', 'NEURO');
    repo.frentesExistentes.set('f-tc', 'TC');
    auditoria = new InMemoryAuditoria();
    service = new TurnosService(repo, auditoria, new FixedClock(AGORA));
  });

  it('cria normalizando os horários e devolve as frentes e a duração', async () => {
    const id = await service.criar(
      ator,
      dados({ horarioInicio: '7:00', frenteIds: ['f-tc', 'f-neuro'] }),
    );

    expect(await service.obter(id)).toMatchObject({
      nome: 'Manhã',
      horarioInicio: '07:00',
      horarioFim: '13:00',
      duracaoMin: 360,
      frentes: [
        { id: 'f-neuro', rotulo: 'NEURO' },
        { id: 'f-tc', rotulo: 'TC' },
      ],
    });
  });

  it('duração: fim antes do início vira a meia-noite; fim igual ao início é 24 h', async () => {
    const plantao = await service.criar(
      ator,
      dados({ nome: 'Plantão', horarioInicio: '19:00', horarioFim: '07:00' }),
    );
    const lista = await service.criar(
      ator,
      dados({ nome: 'Lista', tipo: 'lista', horarioInicio: '07:00', horarioFim: '07:00' }),
    );

    expect((await service.obter(plantao)).duracaoMin).toBe(720);
    expect((await service.obter(lista)).duracaoMin).toBe(1440);
  });

  it('audita a criação como turno, com as frentes', async () => {
    const id = await service.criar(ator, dados());

    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        ator: { tipo: 'usuario', id: 'u-ana' },
        entidade: 'turno',
        entidadeId: id,
        acao: 'criado',
        depois: expect.objectContaining({ nome: 'Manhã', frenteIds: ['f-neuro', 'f-tc'] }),
        em: AGORA,
      }),
    ]);
  });

  it('recusa nome repetido sem diferenciar maiúsculas', async () => {
    await service.criar(ator, dados());

    await expect(service.criar(ator, dados({ nome: 'MANHÃ' }))).rejects.toThrow(NomeEmUsoError);
    await expect(service.criar(ator, dados({ nome: 'MANHÃ' }))).rejects.toThrow(
      'Já existe um turno chamado "MANHÃ".',
    );
  });

  it('recusa horário inválido e frente que não existe', async () => {
    await expect(service.criar(ator, dados({ horarioFim: '25:00' }))).rejects.toThrow(
      EscalaInvalidaError,
    );
    await expect(service.criar(ator, dados({ frenteIds: ['f-sumiu'] }))).rejects.toThrow(
      ReferenciaInexistenteError,
    );
  });

  it('edita trocando o conjunto de frentes e audita só o que mudou', async () => {
    const id = await service.criar(ator, dados());

    await service.atualizar(ator, id, dados({ frenteIds: ['f-neuro'], ordem: 2 }));

    expect((await service.obter(id)).frentes).toEqual([{ id: 'f-neuro', rotulo: 'NEURO' }]);
    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'alterado',
      antes: { frenteIds: ['f-neuro', 'f-tc'], ordem: 0 },
      depois: { frenteIds: ['f-neuro'], ordem: 2 },
    });
  });

  it('edita o próprio turno sem acusar nome repetido', async () => {
    const id = await service.criar(ator, dados());

    await expect(service.atualizar(ator, id, dados({ ordem: 1 }))).resolves.toBeUndefined();
  });

  it('recusa mudar o horário se alocações vigentes (hoje em Brasília) ficariam fora', async () => {
    const id = await service.criar(ator, dados());
    repo.alocacoes.push(
      {
        turnoId: id,
        frenteId: 'f-tc',
        horarioInicio: '07:00',
        horarioFim: '13:00',
        dataFim: null,
        gratificado: false,
      },
      {
        turnoId: id,
        frenteId: 'f-tc',
        horarioInicio: '07:00',
        horarioFim: '13:00',
        dataFim: '2026-11-15',
        gratificado: false,
      },
      // Acabou ontem em Brasília: não conta.
      {
        turnoId: id,
        frenteId: 'f-tc',
        horarioInicio: '07:00',
        horarioFim: '13:00',
        dataFim: '2026-11-14',
        gratificado: false,
      },
    );

    const mudar = service.atualizar(ator, id, dados({ horarioInicio: '08:00' }));
    await expect(mudar).rejects.toThrow(ConflitoEscalaError);
    await expect(service.atualizar(ator, id, dados({ horarioInicio: '08:00' }))).rejects.toThrow(
      '2 alocações vigentes ficariam fora',
    );
    expect((await service.obter(id)).horarioInicio).toBe('07:00');
  });

  it('aceita alargar o horário com alocações vigentes', async () => {
    const id = await service.criar(ator, dados());
    repo.alocacoes.push({
      turnoId: id,
      frenteId: 'f-tc',
      horarioInicio: '07:00',
      horarioFim: '13:00',
      dataFim: null,
      gratificado: false,
    });

    await service.atualizar(ator, id, dados({ horarioInicio: '06:00', horarioFim: '14:00' }));

    expect((await service.obter(id)).duracaoMin).toBe(480);
  });

  it('recusa tirar do turno frente com alocação vigente nele', async () => {
    const id = await service.criar(ator, dados());
    repo.alocacoes.push({
      turnoId: id,
      frenteId: 'f-tc',
      horarioInicio: '07:00',
      horarioFim: '13:00',
      dataFim: null,
      gratificado: false,
    });

    await expect(service.atualizar(ator, id, dados({ frenteIds: ['f-neuro'] }))).rejects.toThrow(
      'A frente TC tem 1 alocação vigente neste turno.',
    );
  });

  it('avisa quando o turno não existe', async () => {
    await expect(service.obter('x')).rejects.toThrow(ItemNaoEncontradoError);
    await expect(service.obter('x')).rejects.toThrow('Turno não encontrado.');
  });

  it('exclui e audita; recusa o turno em uso', async () => {
    const livre = await service.criar(ator, dados());
    const usado = await service.criar(ator, dados({ nome: 'Tarde' }));
    repo.emUso.add(usado);

    await service.excluir(ator, livre);
    await expect(service.obter(livre)).rejects.toThrow(ItemNaoEncontradoError);
    expect(auditoria.eventos.at(-1)).toMatchObject({ acao: 'excluido', antes: { nome: 'Manhã' } });

    await expect(service.excluir(ator, usado)).rejects.toThrow(ItemEmUsoError);
    await expect(service.excluir(ator, usado)).rejects.toThrow(
      'O turno está em uso. Desative-o em vez de excluir.',
    );
  });

  it('lista paginado, com a duração de cada turno', async () => {
    await service.criar(
      ator,
      dados({ nome: 'Tarde', horarioInicio: '13:00', horarioFim: '19:00', ordem: 2 }),
    );
    await service.criar(ator, dados({ ordem: 1 }));

    const pagina = await service.listar({ pagina: 1, porPagina: 1 });
    expect(pagina.total).toBe(2);
    expect(pagina.itens).toEqual([expect.objectContaining({ nome: 'Manhã', duracaoMin: 360 })]);
  });

  it('recusa trocar a Lista para fixo com gratificada vigente', async () => {
    const id = await service.criar(ator, dados({ nome: 'Lista', tipo: 'lista' }));
    repo.alocacoes.push({
      turnoId: id,
      frenteId: 'f-tc',
      horarioInicio: '07:00',
      horarioFim: '13:00',
      dataFim: null,
      gratificado: true,
    });

    await expect(
      service.atualizar(ator, id, dados({ nome: 'Lista', tipo: 'fixo' })),
    ).rejects.toThrow('O turno tem 1 alocação gratificada vigente');
    expect((await service.obter(id)).tipo).toBe('lista');
  });
});
