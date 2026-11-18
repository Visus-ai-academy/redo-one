import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../../auditoria/testing';
import type { Arranjo } from '../../../domain/arranjo';
import { CONFIGURACAO_INICIAL, type ConfiguracaoGlobal } from '../../../domain/configuracao-global';
import type { OcorrenciaRodada } from '../../../domain/motor/medicos-disponiveis';
import type { PrioridadeOperacao } from '../../../domain/motor/prioridades-operacao';
import {
  type CatalogoDaFila,
  type ExameDaLeitura,
  type InsumosRodada,
  RECORTES_VAZIOS,
} from '../../../domain/rodada/entrada';
import { RecorteForaDoEscopoError } from '../../../domain/rodada/escopo';
import { RodadaEmEstadoInvalidoError } from '../../../domain/rodada/maquina';
import { ConfiguracaoEmMemoria, PrioridadesClienteEmMemoria } from '../../../testing/fakes';
import {
  EscopoEmMemoria,
  InsumosFixos,
  MedicosRodadaEmMemoria,
  RodadasEmMemoria,
} from '../../../testing/rodadas-fakes';
import type {
  AtribuidorExames,
  PedidoAtribuicao,
  ResultadoAtribuicao,
} from '../../ports/atribuidor-exames';
import type { FilaExames, LeituraFila } from '../../ports/fila-exames';
import { RodadaRecusadaError, RodadaVivaError } from './erros';
import { criarCasosDeUsoRodada } from './index';

const br = (dataHora: string) => new Date(`${dataHora}:00-03:00`);
const MI = 'esp-mi';
const CT = 'mod-ct';

class MobileMedDeTeste implements FilaExames, AtribuidorExames {
  leitura: LeituraFila = { semMedico: [], emMaos: [] };
  falhaNaLeitura: Error | null = null;
  /** Resultado por exame; ausente = executada. */
  resultados = new Map<string, ResultadoAtribuicao[]>();
  pedidos: PedidoAtribuicao[] = [];
  aoAtribuir: (p: PedidoAtribuicao) => Promise<void> = async () => undefined;

  async ler() {
    if (this.falhaNaLeitura) throw this.falhaNaLeitura;
    return this.leitura;
  }
  async nomesPacientes(ids: readonly string[]) {
    return new Map(
      this.leitura.semMedico
        .filter((e) => ids.includes(e.idExame))
        .map((e) => [e.idExame, e.paciente.nome]),
    );
  }
  async atribuir(p: PedidoAtribuicao): Promise<ResultadoAtribuicao> {
    this.pedidos.push(p);
    await this.aoAtribuir(p);
    return this.resultados.get(p.idExame)?.shift() ?? { status: 'executada' };
  }
}

const catalogo: CatalogoDaFila = {
  classificar: (e) => ({
    exameId: e.estudo === 'TC TORAX' ? 'ex-tc' : null,
    especialidadeId: e.estudo === 'TC TORAX' ? MI : null,
    modalidadeId: e.estudo === 'TC TORAX' ? CT : null,
    subespecialidadeId: null,
    especialidadesDoSegmento: [],
  }),
  cliente: (u) => (u === 'HOSPITAL A' ? 'cli-a' : null),
  traduzirPrioridade: (g) => (g === 'Urgência' ? 'pri-urg' : 'pri-rot'),
};
const arranjo: Arranjo = {
  especialidadeId: null,
  modalidadeIds: [],
  subespecialidadeIds: [],
  subespecialidadeGeral: false,
  prioridadeIds: [],
  modoClientes: 'todos',
  clienteIds: [],
  modoExames: 'todos',
  exameIds: [],
  clientesExclusivosIds: [],
};
const oc = (medicoId: string, p: Partial<OcorrenciaRodada> = {}): OcorrenciaRodada => ({
  alocacaoId: `aloc-${medicoId}`,
  medicoId,
  turnoId: 'manha',
  turnoTipo: 'fixo',
  frente: { tipo: 'especialidade', especialidadeId: MI, modalidadeId: null },
  inicio: br('2026-11-18T07:00'),
  fim: br('2026-11-18T13:00'),
  produtividade: 50,
  gratificado: false,
  prioridadeIds: [],
  subespecialidadeIds: [],
  subespecialidadeGeral: false,
  coberturaDeId: null,
  ausente: false,
  ...p,
});
const op = (id: string, posicao: number, urgencia: PrioridadeOperacao['urgencia'], g: string) =>
  ({
    id,
    nome: id,
    posicao,
    urgencia,
    padrao: id === 'op-rot',
    grafias: [g],
  }) as PrioridadeOperacao;
const insumosBase = (): InsumosRodada => ({
  config: CONFIGURACAO_INICIAL,
  medicos: [
    { id: 'A', nome: 'Dra. A', idMobilemed: 101, arranjos: [arranjo] },
    { id: 'B', nome: 'Dr. B', idMobilemed: 102, arranjos: [arranjo] },
  ],
  equipes: [],
  ocorrencias: [oc('A'), oc('B')],
  frentes: { 'f-mi': { tipo: 'especialidade', especialidadeId: MI, modalidadeId: null } },
  ajustes: [],
  regrasFrente: [],
  prioridadesOperacao: [
    op('op-urg', 1, { tipo: 'sempre' }, 'Urgência'),
    op('op-rot', 3, { tipo: 'nunca' }, 'Rotina'),
  ],
  gradeRecebimento: [],
  prioridadesCliente: [],
  nomes: { 'op-urg': 'URGÊNCIA' },
});
let seq = 0;
const exame = (p: Partial<ExameDaLeitura> = {}): ExameDaLeitura => ({
  idExame: `x${++seq}`,
  prioridade: 'Rotina',
  estudo: 'TC TORAX',
  unidade: 'HOSPITAL A',
  modalidade: 'CT',
  especialidade: null,
  laudos: 1,
  realizadoEm: br('2026-11-18T06:00'),
  entradaEm: br('2026-11-18T06:10'),
  prazo: br('2026-11-20T06:00'),
  status: 'NOVO',
  paciente: { codigo: `${seq}`, nome: `Paciente Fictício ${seq}` },
  ...p,
});

const gestora = { usuarioId: 'g1', acessoTotal: false };
const admin = { usuarioId: 'u1', acessoTotal: true };

describe('rodada do robô (casos de uso)', () => {
  let agora: Date;
  let repo: RodadasEmMemoria;
  let mobilemed: MobileMedDeTeste;
  let auditoria: InMemoryAuditoria;
  let configuracao: ConfiguracaoEmMemoria;
  let medicos: MedicosRodadaEmMemoria;
  let escopo: EscopoEmMemoria;
  let insumos: InsumosFixos;
  let casos: ReturnType<typeof criarCasosDeUsoRodada>;

  const configurar = async (parcial: Partial<ConfiguracaoGlobal>) =>
    configuracao.salvar({ ...CONFIGURACAO_INICIAL, ...parcial });
  const jobs = async () => {
    // Roda as tarefas enfileiradas, como o trabalhador da fila faria.
    while (repo.jobs.length) {
      const j = repo.jobs.shift();
      if (j?.tarefa === 'ler') await casos.lerFila.executar(j.rodadaId);
      if (j?.tarefa === 'executar') await casos.executar.executar(j.rodadaId);
    }
  };
  const criarELer = async (recortes = RECORTES_VAZIOS) => {
    const id = await casos.criar.executar(admin, recortes);
    await jobs();
    return id;
  };
  const designacao = (idExame: string) =>
    repo.designacoesGravadas.find((d) => d.idExame === idExame);

  beforeEach(() => {
    agora = br('2026-11-18T09:00');
    repo = new RodadasEmMemoria();
    mobilemed = new MobileMedDeTeste();
    auditoria = new InMemoryAuditoria();
    configuracao = new ConfiguracaoEmMemoria();
    medicos = new MedicosRodadaEmMemoria([
      { id: 'A', nome: 'Dra. A', ativo: true, habilitadoRobo: true, idMobilemed: 101 },
      { id: 'B', nome: 'Dr. B', ativo: true, habilitadoRobo: true, idMobilemed: 102 },
      { id: 'C', nome: 'Dr. C', ativo: false, habilitadoRobo: true, idMobilemed: 103 },
      { id: 'D', nome: 'Dr. D', ativo: true, habilitadoRobo: false, idMobilemed: null },
    ]);
    escopo = new EscopoEmMemoria();
    insumos = new InsumosFixos(insumosBase(), catalogo);
    casos = criarCasosDeUsoRodada({
      rodadas: repo,
      consulta: repo,
      fila: mobilemed,
      atribuidor: mobilemed,
      insumos,
      medicos,
      escopo,
      configuracao,
      prioridadesCliente: new PrioridadesClienteEmMemoria(),
      pseudonimizador: { pseudonimo: (t) => `hmac(${t})` },
      auditoria,
      agora: () => agora,
    });
    mobilemed.leitura = {
      semMedico: [
        exame({ idExame: 'e1' }),
        exame({ idExame: 'e2', prioridade: 'Urgência' }),
        exame({ idExame: 'e3', estudo: 'ESTUDO SEM CADASTRO' }),
      ],
      emMaos: [],
    };
  });

  describe('criar', () => {
    it('grava a rodada solicitada, enfileira a leitura e audita quem pediu', async () => {
      const id = await casos.criar.executar(admin, RECORTES_VAZIOS);
      expect(repo.rodadas.get(id)).toMatchObject({ status: 'solicitada', solicitadaPorId: 'u1' });
      expect(repo.jobs).toEqual([{ tarefa: 'ler', rodadaId: id }]);
      expect(auditoria.eventos[0]).toMatchObject({
        entidade: 'rodada_distribuicao',
        entidadeId: id,
        acao: 'criada',
        ator: { tipo: 'usuario', id: 'u1' },
      });
    });

    it('recusa com o robô desligado, sem médico habilitado ou com outra rodada viva', async () => {
      await configurar({ roboAtivo: false });
      await expect(casos.criar.executar(admin, RECORTES_VAZIOS)).rejects.toThrow(/desligado/);
      await configurar({ roboAtivo: true });
      medicos.medicos = [];
      await expect(casos.criar.executar(admin, RECORTES_VAZIOS)).rejects.toBeInstanceOf(
        RodadaRecusadaError,
      );
      medicos.medicos = [{ id: 'A', nome: 'A', ativo: true, habilitadoRobo: true, idMobilemed: 1 }];
      await casos.criar.executar(admin, RECORTES_VAZIOS);
      await expect(casos.criar.executar(admin, RECORTES_VAZIOS)).rejects.toBeInstanceOf(
        RodadaVivaError,
      );
    });

    it('a proposta vencida não trava a próxima rodada', async () => {
      await criarELer();
      agora = br('2026-11-18T10:00');
      await expect(casos.criar.executar(admin, RECORTES_VAZIOS)).resolves.toBeTruthy();
    });

    it('a gestora com recorte inicia só dentro dele', async () => {
      escopo.escopos.set('g1', { turnoIds: new Set(['manha']), frenteIds: new Set() });
      const id = await casos.criar.executar(gestora, RECORTES_VAZIOS);
      expect(repo.rodadas.get(id)?.recortes.turnoIds).toEqual(['manha']);
      await casos.cancelar.executar(gestora, id);
      await expect(
        casos.criar.executar(gestora, { ...RECORTES_VAZIOS, turnoIds: ['tarde'] }),
      ).rejects.toBeInstanceOf(RecorteForaDoEscopoError);
    });
  });

  describe('ler a fila', () => {
    it('grava uma designação por exame lido (inclusive as recusadas) e espera a aprovação', async () => {
      const id = await criarELer();
      const r = repo.rodadas.get(id);
      expect(r).toMatchObject({ status: 'aguardando_aprovacao', lidos: 3, urgentes: 1 });
      expect(r?.expiraEm).toEqual(new Date(agora.getTime() + 45 * 60_000));
      expect(repo.designacoesGravadas.map((d) => [d.idExame, d.status])).toEqual([
        ['e2', 'prevista'],
        ['e1', 'prevista'],
        ['e3', 'recusada'],
      ]);
      expect(designacao('e3')?.motivo).toBeTruthy();
      expect(r?.avisos.some((a) => a.includes('fora do catálogo'))).toBe(true);
    });

    it('nunca grava o nome do paciente', async () => {
      await criarELer();
      expect(JSON.stringify(repo.designacoesGravadas)).not.toMatch(/Fict/);
      expect(designacao('e1')?.pacienteChave).toMatch(/^hmac\(codigo:/);
    });

    it('o exame já entregue a um médico e de volta à fila não volta para ele', async () => {
      const id1 = await criarELer();
      await casos.encerrar.executar(admin, id1);
      repo.designacoesGravadas.push({
        ...(designacao('e1') as NonNullable<ReturnType<typeof designacao>>),
        id: 'antiga',
        rodadaId: 'antiga',
        status: 'executada',
        medicoId: 'A',
        executadaEm: br('2026-11-17T10:00'),
      });
      insumos.insumos = { ...insumosBase(), medicos: [insumosBase().medicos[0] as never] };
      const id2 = await criarELer();
      const e1 = repo.designacoesGravadas.find((d) => d.rodadaId === id2 && d.idExame === 'e1');
      expect(e1).toMatchObject({ status: 'recusada', motivo: 'retirado_do_medico' });
    });

    it('lê a escala no instante da leitura e falha com a mensagem se a MobileMed não responde', async () => {
      mobilemed.falhaNaLeitura = new Error('MobileMed fora do ar');
      const id = await criarELer();
      expect(repo.rodadas.get(id)).toMatchObject({
        status: 'falhou',
        erro: 'MobileMed fora do ar',
      });
    });

    it('leitura repetida (o job rodou de novo) não refaz a rodada que já saiu da leitura', async () => {
      const id = await criarELer();
      await casos.lerFila.executar(id);
      expect(insumos.instantes).toHaveLength(1);
    });
  });

  describe('conferência', () => {
    it('tira exame e move para outro médico ativo, com auditoria', async () => {
      const id = await criarELer();
      const e1 = designacao('e1')?.id ?? '';
      const e2 = designacao('e2')?.id ?? '';
      const destino = designacao('e2')?.medicoId === 'A' ? 'B' : 'A';
      await casos.ajustarProposta.executar(admin, id, {
        remover: [e1],
        mover: [{ designacaoId: e2, medicoId: destino }],
      });
      expect(designacao('e1')).toMatchObject({ status: 'pulada', medicoId: null });
      expect(designacao('e2')?.medicoId).toBe(destino);
      expect(auditoria.eventos.at(-1)).toMatchObject({ acao: 'proposta_ajustada' });
    });

    it('recusa médico inativo ou sem conta na MobileMed e exame que não está previsto', async () => {
      const id = await criarELer();
      const e1 = designacao('e1')?.id ?? '';
      const e3 = designacao('e3')?.id ?? '';
      for (const medicoId of ['C', 'D', 'nao-existe']) {
        await expect(
          casos.ajustarProposta.executar(admin, id, {
            remover: [],
            mover: [{ designacaoId: e1, medicoId }],
          }),
        ).rejects.toThrow(/inativo|conta/);
      }
      await expect(
        casos.ajustarProposta.executar(admin, id, { remover: [e3], mover: [] }),
      ).rejects.toThrow(/previsto/);
    });

    it('só ajusta enquanto aguarda aprovação', async () => {
      const id = await criarELer();
      await casos.aprovar.executar(admin, id);
      await expect(
        casos.ajustarProposta.executar(admin, id, { remover: [], mover: [] }),
      ).rejects.toBeInstanceOf(RodadaEmEstadoInvalidoError);
    });
  });

  describe('aprovar e executar', () => {
    it('aprova, enfileira a execução e atribui na ordem da fila, com o resultado por item', async () => {
      const id = await criarELer();
      await casos.aprovar.executar(admin, id);
      expect(repo.rodadas.get(id)).toMatchObject({ status: 'aprovada', aprovadaPorId: 'u1' });
      expect(auditoria.eventos.at(-1)).toMatchObject({ acao: 'aprovada' });
      await jobs();
      expect(mobilemed.pedidos.map((p) => p.idExame)).toEqual(['e2', 'e1']);
      expect(mobilemed.pedidos.every((p) => [101, 102].includes(p.medicoIdMobilemed))).toBe(true);
      expect(repo.rodadas.get(id)?.status).toBe('concluida');
      expect(designacao('e1')).toMatchObject({ status: 'executada' });
      const diario = await repo.eventos(id, 50);
      expect(diario.some((e) => e.total === 2 && e.atual === 2)).toBe(true);
    });

    it('a proposta vencida não é aprovada', async () => {
      const id = await criarELer();
      agora = br('2026-11-18T10:00');
      await expect(casos.aprovar.executar(admin, id)).rejects.toThrow(/expirou/);
      expect(repo.rodadas.get(id)?.status).toBe('expirada');
    });

    it('falha retentável deixa a rodada parcial; retomar reenfileira e conclui', async () => {
      mobilemed.resultados.set('e1', [
        {
          status: 'falhou',
          motivo: 'sessao_caiu',
          detalhe: 'MobileMed: sessão caiu.',
          retentavel: true,
        },
      ]);
      const id = await criarELer();
      await casos.aprovar.executar(admin, id);
      await jobs();
      expect(repo.rodadas.get(id)?.status).toBe('parcial');
      expect(designacao('e1')).toMatchObject({ status: 'falhou', motivo: 'sessao_caiu' });

      await casos.retomar.executar(admin, id);
      await jobs();
      expect(repo.rodadas.get(id)?.status).toBe('concluida');
      expect(designacao('e1')?.status).toBe('executada');
    });

    it('respeita a pausa entre um exame e outro', async () => {
      const id = await criarELer();
      await casos.aprovar.executar(admin, id);
      mobilemed.aoAtribuir = async () => {
        mobilemed.aoAtribuir = async () => undefined;
        await casos.pausar.executar(admin, id);
      };
      await jobs();
      expect(mobilemed.pedidos).toHaveLength(1);
      expect(repo.rodadas.get(id)?.status).toBe('pausada');
      expect((await repo.contar(id)).prevista).toBe(1);

      await casos.retomar.executar(admin, id);
      await jobs();
      expect(repo.rodadas.get(id)?.status).toBe('concluida');
    });

    it('médico sem conta na MobileMed na hora da execução: falha sem tentar', async () => {
      const id = await criarELer();
      await casos.aprovar.executar(admin, id);
      medicos.medicos = medicos.medicos.map((m) => ({ ...m, idMobilemed: null }));
      await jobs();
      expect(mobilemed.pedidos).toHaveLength(0);
      expect(designacao('e1')).toMatchObject({ status: 'falhou', motivo: 'sem_conta_mobilemed' });
      expect(repo.rodadas.get(id)?.status).toBe('falhou');
    });
  });

  describe('controlar', () => {
    it('encerrar deixa o que falta para depois; cancelar idem, e a rodada sai de vez', async () => {
      const id = await criarELer();
      await casos.encerrar.executar(admin, id);
      expect(repo.rodadas.get(id)?.status).toBe('concluida');
      expect(designacao('e1')).toMatchObject({
        status: 'pulada',
        motivo: 'encerrada_pelo_operador',
      });
      const id2 = await criarELer();
      await casos.cancelar.executar(admin, id2);
      expect(repo.rodadas.get(id2)?.status).toBe('cancelada');
      expect(auditoria.eventos.map((e) => e.acao)).toEqual(
        expect.arrayContaining(['encerrada', 'cancelada']),
      );
    });

    it('reler apaga a leitura e lê de novo, só sem execução', async () => {
      const id = await criarELer();
      mobilemed.leitura = { semMedico: [exame({ idExame: 'novo' })], emMaos: [] };
      await casos.reler.executar(admin, id);
      await jobs();
      expect(repo.designacoesGravadas.map((d) => d.idExame)).toEqual(['novo']);
    });

    it('trocar médicos: antes da leitura só grava; com a proposta pronta, relê sem o excluído', async () => {
      const id = await casos.criar.executar(admin, RECORTES_VAZIOS);
      await casos.ajustarMedicos.executar(admin, id, { excluidos: ['A'], incluidos: [] });
      expect(repo.jobs).toHaveLength(1);
      await jobs();
      expect(repo.designacoesGravadas.filter((d) => d.medicoId === 'A')).toEqual([]);
      await casos.ajustarMedicos.executar(admin, id, { excluidos: ['B'], incluidos: [] });
      await jobs();
      expect(repo.designacoesGravadas.filter((d) => d.medicoId === 'B')).toEqual([]);
      expect(repo.designacoesGravadas.some((d) => d.medicoId === 'A')).toBe(true);
    });

    it('a gestora não controla rodada fora do recorte dela', async () => {
      escopo.escopos.set('g1', { turnoIds: new Set(['manha']), frenteIds: new Set() });
      const id = await criarELer();
      await expect(casos.pausar.executar(gestora, id)).rejects.toBeInstanceOf(
        RecorteForaDoEscopoError,
      );
    });
  });

  describe('consultas', () => {
    it('situação leve: status, progresso e contagens', async () => {
      const id = await criarELer();
      const s = await casos.situacao.executar(id);
      expect(s).toMatchObject({
        id,
        status: 'aguardando_aprovacao',
        contagens: { prevista: 2, recusada: 1 },
      });
    });

    it('designações sem o nome do paciente; com a permissão, o nome vem da MobileMed e a leitura é auditada', async () => {
      const id = await criarELer();
      const sem = await casos.designacoes.executar(admin, id, { pagina: 1, porPagina: 50 }, false);
      expect(sem.itens.every((d) => d.nomePaciente === null)).toBe(true);
      expect(auditoria.eventos.some((e) => e.acao === 'paciente_lido')).toBe(false);

      const com = await casos.designacoes.executar(admin, id, { pagina: 1, porPagina: 50 }, true);
      expect(com.itens.find((d) => d.idExameMobilemed === 'e1')?.nomePaciente).toMatch(/Fict/);
      expect(auditoria.eventos.at(-1)).toMatchObject({
        acao: 'paciente_lido',
        entidade: 'rodada_distribuicao',
        depois: { exames: 3 },
      });
      expect(JSON.stringify(auditoria.eventos)).not.toMatch(/Fict/);
    });

    it('fila do momento: contagens por prioridade da operação e frente, e quem está em turno', async () => {
      const f = await casos.filaDoMomento.executar();
      expect(f.total).toBe(3);
      expect(f.porPrioridade).toEqual(
        expect.arrayContaining([
          { prioridadeOperacaoId: 'op-urg', nome: 'URGÊNCIA', exames: 1, urgentes: 1 },
        ]),
      );
      expect(f.porEspecialidade).toEqual(
        expect.arrayContaining([expect.objectContaining({ especialidadeId: MI, exames: 2 })]),
      );
      expect(f.medicosEmTurno.map((m) => m.medicoId).sort()).toEqual(['A', 'B']);
    });
  });
});
