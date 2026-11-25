import { beforeEach, describe, expect, it } from 'vitest';

import { EscalaInvalidaError } from '../domain';
import { FakeEscopoEscalaRepository } from '../testing/fakes';
import { AusenciasService, type EntradaAusencias } from './ausencias.service';
import { FakeAusenciasRepository } from './testing';

const AGORA = new Date('2026-11-16T15:00:00Z');
const admin = { usuarioId: 'u-admin', acessoTotal: true, veObservacoes: true };
const gestora = { usuarioId: 'u-gestora', acessoTotal: false, veObservacoes: true };
/** Sem `ausencias.observacoes.ver`: o texto (dado de saúde) não sai. */
const semObservacoes = { usuarioId: 'u-gestora', acessoTotal: false, veObservacoes: false };

function montar() {
  const repo = new FakeAusenciasRepository();
  const escopos = new FakeEscopoEscalaRepository();
  const service = new AusenciasService(repo, escopos, { now: () => AGORA });

  repo.medicos.set('m-ana', 'Ana Souza');
  repo.medicos.set('m-bia', 'Bia Lima');
  repo.medicos.set('m-caio', 'Caio Reis');
  repo.tipos.set('t-ferias', {
    id: 't-ferias',
    nome: 'Férias',
    cor: '#00AA00',
    soGestor: false,
    ativo: true,
  });
  repo.tipos.set('t-dispensa', {
    id: 't-dispensa',
    nome: 'Dispensado',
    cor: null,
    soGestor: true,
    ativo: true,
  });
  repo.tipos.set('t-velho', {
    id: 't-velho',
    nome: 'Antigo',
    cor: null,
    soGestor: false,
    ativo: false,
  });
  repo.frentes.set('f-neuro', 'NEURO');
  repo.frentes.set('f-tc', 'TC');
  repo.frentes.set('f-rx', 'RX');
  repo.turnos.set('tu-manha', 'Manhã');
  repo.turnos.set('tu-tarde', 'Tarde');
  repo.usuarios.set('u-admin', { nome: 'Admin', medicoId: null });
  repo.usuarios.set('u-gestora', { nome: 'Gestora', medicoId: null });
  // Ana: NEURO de manhã (fixa). Bia: TC à tarde até out/2026. Caio: RX de manhã.
  repo.alocacoes.push(
    {
      medicoId: 'm-ana',
      turnoId: 'tu-manha',
      frenteId: 'f-neuro',
      dataInicio: '2026-01-01',
      dataFim: null,
    },
    {
      medicoId: 'm-bia',
      turnoId: 'tu-tarde',
      frenteId: 'f-tc',
      dataInicio: '2026-01-01',
      dataFim: '2026-10-31',
    },
    {
      medicoId: 'm-caio',
      turnoId: 'tu-manha',
      frenteId: 'f-rx',
      dataInicio: '2026-01-01',
      dataFim: null,
    },
  );
  return { repo, escopos, service };
}

/** "Todos" explícito onde o recorte não veio (vazio nunca é "todos"). */
const todosOnde = (e: { frenteIds?: string[]; turnoIds?: string[]; diasSemana?: number[] }) => ({
  todasFrentes: !e.frenteIds?.length,
  todosTurnos: !e.turnoIds?.length,
  todosDias: !e.diasSemana?.length,
});

const entrada = (extra: Partial<EntradaAusencias> = {}): EntradaAusencias => ({
  medicoIds: ['m-ana'],
  tipoId: 't-ferias',
  dataInicio: '2026-12-01',
  dataFim: '2026-12-10',
  ...todosOnde(extra),
  ...extra,
});

describe('AusenciasService', () => {
  let ctx: ReturnType<typeof montar>;
  beforeEach(() => {
    ctx = montar();
  });

  describe('criar', () => {
    it('cria uma ausência aprovada por médico, de origem gestor, com auditoria', async () => {
      const { service, repo } = ctx;

      const ids = await service.criar(
        admin,
        entrada({ medicoIds: ['m-ana', 'm-caio'], observacoes: ' gripe ' }),
      );

      expect(ids).toHaveLength(2);
      const criadas = await Promise.all(ids.map((id) => repo.buscar(id)));
      expect(criadas.map((a) => a?.medico.id).sort()).toEqual(['m-ana', 'm-caio']);
      expect(criadas[0]).toMatchObject({
        situacao: 'aprovada',
        origem: 'gestor',
        observacoes: 'gripe',
        frentes: [],
        turnos: [],
        solicitadaPor: { id: 'u-admin' },
        revisadaPor: null,
      });
      expect(repo.eventos).toHaveLength(2);
      expect(repo.eventos[0]).toMatchObject({
        ator: { tipo: 'usuario', id: 'u-admin' },
        entidade: 'ausencia',
        acao: 'criada',
        em: AGORA,
        depois: {
          medicoId: expect.any(String),
          frenteIds: [],
          turnoIds: [],
          observacoesAlteradas: true,
        },
      });
    });

    it('nunca grava o texto das observações na auditoria', async () => {
      const { service, repo } = ctx;
      const [id] = await service.criar(admin, entrada({ observacoes: 'cirurgia cardíaca' }));
      await service.atualizar(admin, id ?? '', { ...entrada(), observacoes: 'outra doença' });

      expect(JSON.stringify(repo.eventos)).not.toContain('cirurgia');
      expect(JSON.stringify(repo.eventos)).not.toContain('doença');
      expect(repo.eventos[1]?.depois).toMatchObject({ observacoesAlteradas: true });
    });

    it('exige ao menos um médico e médicos, frentes, turnos e tipo existentes', async () => {
      const { service } = ctx;

      await expect(service.criar(admin, entrada({ medicoIds: [] }))).rejects.toThrow(/médico/);
      await expect(service.criar(admin, entrada({ medicoIds: ['m-x'] }))).rejects.toThrow(/Médico/);
      await expect(service.criar(admin, entrada({ frenteIds: ['f-x'] }))).rejects.toThrow(/Frente/);
      await expect(service.criar(admin, entrada({ turnoIds: ['tu-x'] }))).rejects.toThrow(/Turno/);
      await expect(service.criar(admin, entrada({ tipoId: 't-x' }))).rejects.toThrow(/Tipo/);
    });

    it('recusa tipo inativo e período inválido', async () => {
      const { service } = ctx;

      await expect(service.criar(admin, entrada({ tipoId: 't-velho' }))).rejects.toThrow(/inativo/);
      await expect(
        service.criar(admin, entrada({ dataInicio: '2026-12-10', dataFim: '2026-12-01' })),
      ).rejects.toThrow(EscalaInvalidaError);
    });

    it('o gestor pode lançar tipo que só o gestor lança', async () => {
      await expect(
        ctx.service.criar(admin, entrada({ tipoId: 't-dispensa' })),
      ).resolves.toHaveLength(1);
    });

    it('gestora só lança para médico com alocação vigente no recorte, no período', async () => {
      const { service, escopos, repo } = ctx;
      await escopos.definir('u-gestora', { turnoIds: [], frenteIds: ['f-neuro', 'f-tc'] });

      // Caio está fora (RX). Bia tem TC, mas a alocação acabou em outubro.
      await expect(
        service.criar(gestora, entrada({ medicoIds: ['m-ana', 'm-caio'] })),
      ).rejects.toThrow(/recorte/);
      await expect(service.criar(gestora, entrada({ medicoIds: ['m-bia'] }))).rejects.toThrow(
        /recorte/,
      );
      await expect(
        service.criar(
          gestora,
          entrada({ medicoIds: ['m-bia'], dataInicio: '2026-10-20', dataFim: '2026-11-05' }),
        ),
      ).resolves.toHaveLength(1);
      expect(repo.ausencias.size).toBe(1);
    });

    it('gestora com recorte de frente: "todas as frentes" vira as frentes do recorte', async () => {
      const { service, escopos, repo } = ctx;
      await escopos.definir('u-gestora', { turnoIds: [], frenteIds: ['f-tc', 'f-neuro'] });

      const [id] = await service.criar(gestora, entrada());

      const criada = await repo.buscar(id ?? '');
      expect(criada?.frentes.map((f) => f.id).sort()).toEqual(['f-neuro', 'f-tc']);
    });

    it('gestora com recorte de turno: "o dia inteiro" vira os turnos do recorte, em todas as frentes', async () => {
      const { service, escopos, repo } = ctx;
      await escopos.definir('u-gestora', { turnoIds: ['tu-manha'], frenteIds: [] });

      const ids = await service.criar(gestora, entrada({ medicoIds: ['m-ana', 'm-caio'] }));

      for (const id of ids) {
        expect(await repo.buscar(id)).toMatchObject({ turnos: [{ id: 'tu-manha' }], frentes: [] });
      }
    });

    it('gestora com recorte de turno: frente escolhida fica só nos turnos do recorte', async () => {
      const { service, escopos, repo } = ctx;
      await escopos.definir('u-gestora', { turnoIds: ['tu-manha'], frenteIds: [] });

      const [id = ''] = await service.criar(gestora, entrada({ frenteIds: ['f-neuro'] }));

      expect(await repo.buscar(id)).toMatchObject({
        turnos: [{ id: 'tu-manha' }],
        frentes: [{ id: 'f-neuro' }],
      });
    });

    it('gestora com recorte de turno não escolhe turno fora do recorte', async () => {
      const { service, escopos } = ctx;
      await escopos.definir('u-gestora', { turnoIds: ['tu-manha'], frenteIds: [] });

      await expect(
        service.criar(gestora, entrada({ turnoIds: ['tu-manha', 'tu-tarde'] })),
      ).rejects.toThrow(/recorte/);
    });

    it('turno fora do recorte vale se todas as frentes escolhidas estão no recorte', async () => {
      const { service, escopos, repo } = ctx;
      await escopos.definir('u-gestora', { turnoIds: [], frenteIds: ['f-neuro'] });

      const [id = ''] = await service.criar(gestora, entrada({ turnoIds: ['tu-tarde'] }));

      expect(await repo.buscar(id)).toMatchObject({
        turnos: [{ id: 'tu-tarde' }],
        frentes: [{ id: 'f-neuro' }],
      });
    });

    it('recorte misto: restringe pelos turnos se o médico tem alocação neles, senão pelas frentes', async () => {
      const { service, escopos, repo } = ctx;
      await escopos.definir('u-gestora', { turnoIds: ['tu-tarde'], frenteIds: ['f-neuro'] });

      // Ana só está no recorte pela frente (NEURO de manhã); Bia pelo turno (TC à tarde).
      const [ana = '', bia = ''] = await service.criar(
        gestora,
        entrada({ medicoIds: ['m-ana', 'm-bia'], dataInicio: '2026-10-20', dataFim: '2026-11-05' }),
      );

      expect(await repo.buscar(ana)).toMatchObject({ turnos: [], frentes: [{ id: 'f-neuro' }] });
      expect(await repo.buscar(bia)).toMatchObject({ turnos: [{ id: 'tu-tarde' }], frentes: [] });
    });

    it('gestora não escolhe frente fora do recorte', async () => {
      const { service, escopos } = ctx;
      await escopos.definir('u-gestora', { turnoIds: [], frenteIds: ['f-neuro'] });

      await expect(service.criar(gestora, entrada({ frenteIds: ['f-rx'] }))).rejects.toThrow(
        /recorte/,
      );
      await expect(
        service.criar(gestora, entrada({ frenteIds: ['f-neuro'] })),
      ).resolves.toHaveLength(1);
    });
  });

  describe('listar, obter e contar', () => {
    async function popular() {
      const { service, repo } = ctx;
      const [ana] = await service.criar(admin, entrada({ observacoes: 'segredo da Ana' }));
      const [caio] = await service.criar(
        admin,
        entrada({ medicoIds: ['m-caio'], observacoes: 'segredo do Caio' }),
      );
      const antiga = await service.criar(
        admin,
        entrada({ dataInicio: '2026-09-01', dataFim: '2026-09-05' }),
      );
      repo.copiar(ana ?? '', 'p-ana', { situacao: 'pendente' });
      repo.copiar(caio ?? '', 'p-caio', { situacao: 'pendente' });
      return { ana: ana ?? '', caio: caio ?? '', antiga: antiga[0] ?? '' };
    }

    it('lista paginada, por padrão de hoje − 30 dias em diante', async () => {
      const { service } = ctx;
      const { antiga } = await popular();

      const pagina = await service.listar(admin, { pagina: 1, porPagina: 10 });

      expect(pagina.total).toBe(4);
      expect(pagina.itens.map((a) => a.id)).not.toContain(antiga);
      expect(pagina.itens.slice(0, 2).map((a) => a.situacao)).toEqual(['pendente', 'pendente']);
      const comAntigas = await service.listar(admin, {
        pagina: 1,
        porPagina: 10,
        de: '2026-01-01',
      });
      expect(comAntigas.total).toBe(5);
    });

    it('recusa período com início depois do fim', async () => {
      await expect(
        ctx.service.listar(admin, {
          pagina: 1,
          porPagina: 10,
          de: '2026-12-10',
          ate: '2026-12-01',
        }),
      ).rejects.toThrow(EscalaInvalidaError);
    });

    it('gestora só vê, conta e abre ausências de médicos no recorte', async () => {
      const { service, escopos } = ctx;
      const { caio } = await popular();
      await escopos.definir('u-gestora', { turnoIds: [], frenteIds: ['f-neuro'] });

      const pagina = await service.listar(gestora, { pagina: 1, porPagina: 10 });

      expect(pagina.itens.every((a) => a.medico.id === 'm-ana')).toBe(true);
      expect(JSON.stringify(pagina)).not.toContain('segredo do Caio');
      expect(await service.contarPendentes(gestora)).toBe(1);
      expect(await service.contarPendentes(admin)).toBe(2);
      await expect(service.obter(gestora, caio)).rejects.toThrow(/não encontrada/);
      await expect(service.obter(admin, caio)).resolves.toMatchObject({ medico: { id: 'm-caio' } });
    });
  });

  describe('atualizar e excluir', () => {
    it('edita uma ausência, mantendo médico, situação e origem, com auditoria das mudanças', async () => {
      const { service, repo } = ctx;
      const [id = ''] = await service.criar(admin, entrada());

      await service.atualizar(admin, id, {
        tipoId: 't-dispensa',
        dataInicio: '2026-12-01',
        dataFim: '2026-12-20',
        todasFrentes: true,
        todosDias: true,
        todosTurnos: false,
        turnoIds: ['tu-manha'],
      });

      expect(await repo.buscar(id)).toMatchObject({
        medico: { id: 'm-ana' },
        tipo: { id: 't-dispensa' },
        dataFim: '2026-12-20',
        turnos: [{ id: 'tu-manha', nome: 'Manhã' }],
        situacao: 'aprovada',
      });
      expect(repo.eventos.at(-1)).toMatchObject({
        acao: 'alterada',
        antes: {
          tipoId: 't-ferias',
          dataFim: '2026-12-10',
          todosTurnos: true,
          turnoIds: [],
          medicoId: 'm-ana',
        },
        depois: {
          tipoId: 't-dispensa',
          dataFim: '2026-12-20',
          todosTurnos: false,
          turnoIds: ['tu-manha'],
          medicoId: 'm-ana',
        },
      });
    });

    it('sem mudança, não grava nem audita', async () => {
      const { service, repo } = ctx;
      const [id = ''] = await service.criar(admin, entrada());

      await service.atualizar(admin, id, entrada());

      expect(repo.eventos).toHaveLength(1);
    });

    it('mantém tipo inativo já usado, mas não troca para um inativo', async () => {
      const { service, repo } = ctx;
      const [id = ''] = await service.criar(admin, entrada());
      await expect(service.atualizar(admin, id, entrada({ tipoId: 't-velho' }))).rejects.toThrow(
        /inativo/,
      );

      const tipo = repo.tipos.get('t-ferias');
      if (tipo) tipo.ativo = false;
      await expect(
        service.atualizar(admin, id, entrada({ dataFim: '2026-12-11' })),
      ).resolves.toBeUndefined();
    });

    it('gestora edita a ausência inteira no recorte sem mexer nas frentes e turnos', async () => {
      const { service, escopos, repo } = ctx;
      await escopos.definir('u-gestora', { turnoIds: [], frenteIds: ['f-neuro', 'f-tc'] });
      const [id = ''] = await service.criar(admin, entrada({ frenteIds: ['f-neuro'] }));

      await service.atualizar(gestora, id, {
        ...entrada({ frenteIds: ['f-neuro'] }),
        observacoes: 'só a observação',
      });

      expect(await repo.buscar(id)).toMatchObject({ frentes: [{ id: 'f-neuro' }], turnos: [] });
      expect(repo.eventos.at(-1)).toMatchObject({
        antes: { frenteIds: ['f-neuro'], turnoIds: [] },
        depois: { frenteIds: ['f-neuro'], turnoIds: [], observacoesAlteradas: true },
      });
    });

    it('gestora não edita, exclui, aprova nem recusa ausência que vale fora do recorte', async () => {
      const { service, escopos, repo } = ctx;
      // "Todas as frentes" e "o dia inteiro": também tira a Ana da Tarde, de outra gestora.
      const [id = ''] = await service.criar(admin, entrada());
      repo.copiar(id, 'p-ana', { situacao: 'pendente', origem: 'medico' });
      await escopos.definir('u-gestora', { turnoIds: ['tu-manha'], frenteIds: ['f-neuro'] });

      const fora = /fora do seu recorte/;
      await expect(
        service.atualizar(gestora, id, { ...entrada(), observacoes: 'x' }),
      ).rejects.toThrow(fora);
      await expect(service.excluir(gestora, id)).rejects.toThrow(fora);
      await expect(service.aprovar(gestora, 'p-ana')).rejects.toThrow(fora);
      await expect(service.recusar(gestora, 'p-ana', 'não')).rejects.toThrow(fora);
      await expect(service.obter(gestora, id)).resolves.toMatchObject({ id });
      expect(repo.ausencias.get(id)?.observacoes).toBeNull();
      expect(repo.ausencias.get('p-ana')?.situacao).toBe('pendente');
    });

    it('gestora não amplia a ausência para fora do recorte na edição', async () => {
      const { service, escopos } = ctx;
      await escopos.definir('u-gestora', { turnoIds: ['tu-manha'], frenteIds: [] });
      const [id = ''] = await service.criar(gestora, entrada());

      await expect(
        service.atualizar(gestora, id, entrada({ turnoIds: ['tu-manha', 'tu-tarde'] })),
      ).rejects.toThrow(/recorte/);
    });

    it('gestora não edita nem exclui ausência de médico fora do recorte', async () => {
      const { service, escopos } = ctx;
      const [id = ''] = await service.criar(admin, entrada({ medicoIds: ['m-caio'] }));
      await escopos.definir('u-gestora', { turnoIds: [], frenteIds: ['f-neuro'] });

      await expect(service.atualizar(gestora, id, entrada())).rejects.toThrow(/não encontrada/);
      await expect(service.excluir(gestora, id)).rejects.toThrow(/não encontrada/);
    });

    it('exclui com auditoria sem observações', async () => {
      const { service, repo } = ctx;
      const [id = ''] = await service.criar(admin, entrada({ observacoes: 'atestado' }));

      await service.excluir(admin, id);

      expect(repo.ausencias.size).toBe(0);
      expect(repo.eventos.at(-1)).toMatchObject({
        acao: 'excluida',
        antes: { medicoId: 'm-ana', frenteIds: [], turnoIds: [] },
      });
      expect(JSON.stringify(repo.eventos)).not.toContain('atestado');
      await expect(service.excluir(admin, id)).rejects.toThrow(/não encontrada/);
    });
  });

  describe('observações (dado de saúde)', () => {
    async function recusada() {
      const { service, repo } = ctx;
      const [id = ''] = await service.criar(
        admin,
        entrada({ observacoes: 'atestado de cirurgia' }),
      );
      repo.copiar(id, 'p-1', { situacao: 'pendente', origem: 'medico' });
      await service.recusar(admin, 'p-1', 'escala cheia');
      const [vazia = ''] = await service.criar(admin, entrada({ medicoIds: ['m-caio'] }));
      return { id, vazia };
    }

    it('sem a permissão, a lista e o detalhe trazem só se há observação, sem o texto nem o motivo da recusa', async () => {
      const { service } = ctx;
      const { vazia } = await recusada();

      const { itens } = await service.listar(semObservacoes, { pagina: 1, porPagina: 10 });
      const recusa = itens.find((a) => a.id === 'p-1');

      expect(recusa).toMatchObject({
        situacao: 'recusada',
        observacoes: null,
        motivoRecusa: null,
        temObservacoes: true,
      });
      expect(itens.find((a) => a.id === vazia)).toMatchObject({
        observacoes: null,
        temObservacoes: false,
      });
      expect(JSON.stringify(itens)).not.toMatch(/atestado|cheia/);
      await expect(service.obter(semObservacoes, 'p-1')).resolves.toMatchObject({
        observacoes: null,
        motivoRecusa: null,
        temObservacoes: true,
      });
    });

    it('com a permissão, trazem o texto', async () => {
      const { service } = ctx;
      const { vazia } = await recusada();

      await expect(service.obter(gestora, 'p-1')).resolves.toMatchObject({
        observacoes: 'atestado de cirurgia',
        motivoRecusa: 'escala cheia',
        temObservacoes: true,
      });
      const { itens } = await service.listar(admin, { pagina: 1, porPagina: 10 });
      expect(itens.find((a) => a.id === vazia)).toMatchObject({
        observacoes: null,
        temObservacoes: false,
      });
    });

    it('sem a permissão, editar mantém a observação gravada (a tela não a recebeu)', async () => {
      const { service, repo } = ctx;
      const [id = ''] = await service.criar(admin, entrada({ observacoes: 'atestado' }));

      await service.atualizar(semObservacoes, id, { ...entrada(), observacoes: null });
      await service.atualizar(semObservacoes, id, { ...entrada(), observacoes: 'trocada' });

      expect(repo.ausencias.get(id)?.observacoes).toBe('atestado');
    });
  });

  describe('aprovar e recusar', () => {
    function pendente(medicoId = 'm-ana') {
      ctx.repo.ausencias.set('p-1', {
        id: 'p-1',
        medicoId,
        tipoId: 't-ferias',
        dataInicio: '2026-12-01',
        dataFim: '2026-12-05',
        todosDias: true,
        diasSemana: [],
        todasFrentes: true,
        frenteIds: [],
        todosTurnos: true,
        turnoIds: [],
        observacoes: 'consulta',
        situacao: 'pendente',
        origem: 'medico',
        solicitadaPorId: null,
        motivoRecusa: null,
        revisadaPorId: null,
        revisadaEm: null,
        criadoEm: AGORA,
      });
    }

    it('aprova a pendente gravando quem e quando', async () => {
      const { service, repo } = ctx;
      pendente();

      await service.aprovar(admin, 'p-1');

      expect(await repo.buscar('p-1')).toMatchObject({
        situacao: 'aprovada',
        revisadaPor: { id: 'u-admin' },
        revisadaEm: AGORA,
      });
      expect(repo.eventos.at(-1)).toMatchObject({
        acao: 'aprovada',
        antes: { situacao: 'pendente', medicoId: 'm-ana' },
        depois: { situacao: 'aprovada', medicoId: 'm-ana', frenteIds: [], turnoIds: [] },
      });
      await expect(service.aprovar(admin, 'p-1')).rejects.toThrow(/revisada/);
    });

    it('recusa com motivo, sem pôr o motivo na auditoria', async () => {
      const { service, repo } = ctx;
      pendente();

      await expect(service.recusar(admin, 'p-1', '  ')).rejects.toThrow(/motivo/);
      await service.recusar(admin, 'p-1', 'Escala cheia');

      expect(await repo.buscar('p-1')).toMatchObject({
        situacao: 'recusada',
        motivoRecusa: 'Escala cheia',
      });
      expect(repo.eventos.at(-1)).toMatchObject({
        acao: 'recusada',
        depois: { situacao: 'recusada', motivoRecusaAlterado: true },
      });
      expect(JSON.stringify(repo.eventos)).not.toContain('Escala cheia');
    });

    it('gestora só decide pedidos de médicos no recorte', async () => {
      const { service, escopos } = ctx;
      pendente('m-caio');
      await escopos.definir('u-gestora', { turnoIds: [], frenteIds: ['f-neuro'] });

      await expect(service.aprovar(gestora, 'p-1')).rejects.toThrow(/não encontrada/);
      await expect(service.recusar(gestora, 'p-1', 'não')).rejects.toThrow(/não encontrada/);
      await escopos.definir('u-gestora', { turnoIds: ['tu-manha'], frenteIds: [] });
      const p1 = ctx.repo.ausencias.get('p-1');
      if (p1) Object.assign(p1, { todosTurnos: false, turnoIds: ['tu-manha'] });
      await expect(service.aprovar(gestora, 'p-1')).resolves.toBeUndefined();
    });
  });
});
