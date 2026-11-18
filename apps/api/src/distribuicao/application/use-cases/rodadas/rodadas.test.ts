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
  /** Exames que ganharam médico na MobileMed por fora do robô. */
  atribuidosPorFora = new Set<string>();
  async semMedico(ids: readonly string[]) {
    return new Set(ids.filter((id) => !this.atribuidosPorFora.has(id)));
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

    it('tirar guarda de quem o exame saiu; desfazer devolve ao mesmo médico', async () => {
      const id = await criarELer();
      const e1 = designacao('e1');
      const medico = e1?.medicoId;
      await casos.ajustarProposta.executar(admin, id, { remover: [e1?.id ?? ''], mover: [] });
      expect(designacao('e1')).toMatchObject({
        status: 'pulada',
        medicoId: null,
        retiradoDeId: medico,
        retiradaEm: agora,
      });
      await casos.ajustarProposta.executar(admin, id, {
        remover: [],
        mover: [],
        restaurar: [e1?.id ?? ''],
      });
      expect(designacao('e1')).toMatchObject({
        status: 'prevista',
        medicoId: medico,
        retiradoDeId: null,
        motivo: null,
      });
    });

    it('o exame tirado de um médico na conferência não volta a ele na próxima rodada', async () => {
      insumos.insumos = { ...insumosBase(), medicos: [insumosBase().medicos[0] as never] };
      const id1 = await criarELer();
      expect(designacao('e1')?.medicoId).toBe('A');
      await casos.ajustarProposta.executar(admin, id1, {
        remover: [designacao('e1')?.id ?? ''],
        mover: [],
      });
      await casos.cancelar.executar(admin, id1);
      const id2 = await criarELer();
      const e1 = repo.designacoesGravadas.find((d) => d.rodadaId === id2 && d.idExame === 'e1');
      expect(e1).toMatchObject({ status: 'recusada', motivo: 'retirado_do_medico' });
      expect(e1?.detalhe).toMatch(/conferência/);
      expect(e1?.barrados).toEqual({ A: 'retirado_na_conferencia' });
    });

    it('mover com o pacote leva os outros exames do paciente que iam ao mesmo médico; sem, só o exame', async () => {
      insumos.insumos = { ...insumosBase(), medicos: [insumosBase().medicos[0] as never] };
      const paciente = { codigo: 'p1', nome: 'Paciente Fictício do Pacote' };
      mobilemed.leitura = {
        semMedico: [
          exame({ idExame: 'p-a', paciente }),
          exame({ idExame: 'p-b', paciente }),
          exame({ idExame: 'p-c', paciente }),
        ],
        emMaos: [],
      };
      const id = await criarELer();
      await casos.ajustarProposta.executar(admin, id, {
        remover: [],
        mover: [{ designacaoId: designacao('p-a')?.id ?? '', medicoId: 'B' }],
      });
      expect(['p-a', 'p-b', 'p-c'].map((x) => designacao(x)?.medicoId)).toEqual(['B', 'A', 'A']);
      await casos.ajustarProposta.executar(admin, id, {
        remover: [],
        mover: [{ designacaoId: designacao('p-b')?.id ?? '', medicoId: 'B', levarPacote: true }],
      });
      expect(['p-a', 'p-b', 'p-c'].map((x) => designacao(x)?.medicoId)).toEqual(['B', 'B', 'B']);
    });

    it('manda na mão um exame que o motor deixou de fora: entra na proposta marcado', async () => {
      const id = await criarELer();
      const e3 = designacao('e3');
      expect(e3?.status).toBe('recusada');
      await casos.ajustarProposta.executar(admin, id, {
        remover: [],
        mover: [{ designacaoId: e3?.id ?? '', medicoId: 'B' }],
      });
      expect(designacao('e3')).toMatchObject({ status: 'prevista', medicoId: 'B', naMao: true });
      await casos.aprovar.executar(admin, id);
      await jobs();
      expect(designacao('e3')).toMatchObject({ status: 'executada', naMao: true });
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

    it('ao retomar, o exame que ganhou médico na MobileMed é pulado sem atribuir', async () => {
      const id = await criarELer();
      await casos.aprovar.executar(admin, id);
      mobilemed.aoAtribuir = async () => {
        mobilemed.aoAtribuir = async () => undefined;
        await casos.pausar.executar(admin, id);
      };
      await jobs();
      expect(mobilemed.pedidos.map((p) => p.idExame)).toEqual(['e2']);
      mobilemed.atribuidosPorFora.add('e1');
      await casos.retomar.executar(admin, id);
      await jobs();
      expect(mobilemed.pedidos.map((p) => p.idExame)).toEqual(['e2']);
      expect(designacao('e1')).toMatchObject({
        status: 'pulada',
        motivo: 'ja_atribuido_mobilemed',
      });
      expect(designacao('e1')?.detalhe).toMatch(/já atribuído na MobileMed/);
      expect(repo.rodadas.get(id)?.status).toBe('concluida');
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

    it('a proposta expirada fica no histórico com os ajustes: não se relê', async () => {
      const id = await criarELer();
      await casos.ajustarProposta.executar(admin, id, {
        remover: [designacao('e1')?.id ?? ''],
        mover: [],
      });
      agora = br('2026-11-18T10:00');
      await expect(casos.reler.executar(admin, id)).rejects.toThrow(/histórico/);
      expect(repo.rodadas.get(id)?.status).toBe('expirada');
      expect(designacao('e1')).toMatchObject({
        status: 'pulada',
        motivo: 'removido_na_conferencia',
      });
    });

    it('cancelar durante a execução deixa o que falta como pulado', async () => {
      const id = await criarELer();
      await casos.aprovar.executar(admin, id);
      mobilemed.aoAtribuir = async () => {
        mobilemed.aoAtribuir = async () => undefined;
        await casos.cancelar.executar(admin, id);
      };
      await jobs();
      expect(repo.rodadas.get(id)?.status).toBe('cancelada');
      expect(designacao('e1')).toMatchObject({ status: 'pulada', motivo: 'rodada_cancelada' });
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

    it('resumo da proposta: por médico (teto, carga, propostos, urgências), motivos e ajustes', async () => {
      const id = await criarELer();
      const e1 = designacao('e1');
      await casos.ajustarProposta.executar(admin, id, { remover: [e1?.id ?? ''], mover: [] });
      const r = await casos.resumo.executar(id);
      const propostos = r.medicos.reduce((s, m) => s + m.propostos, 0);
      expect(propostos).toBe(1);
      expect(r.medicos.map((m) => m.medicoId).sort()).toEqual(['A', 'B']);
      expect(r.medicos[0]).toMatchObject({
        turnos: ['manha'],
        capacidade: expect.any(Number),
        cargaEmMaos: 0,
      });
      expect(r.motivos).toEqual(
        expect.arrayContaining([
          { status: 'pulada', motivo: 'removido_na_conferencia', quantidade: 1 },
          expect.objectContaining({ status: 'recusada', quantidade: 1 }),
        ]),
      );
      expect(r.ajustes).toEqual({ tirados: 1, movidos: 0, naMao: 0 });
      expect(r.funilMedicos).toMatchObject({ habilitados: 2, noHorario: 2, receberam: 1 });
    });

    it('por que este médico não pegou: os portões do médico diante do exame', async () => {
      insumos.insumos = {
        ...insumosBase(),
        medicos: [
          insumosBase().medicos[0] as never,
          {
            id: 'B',
            nome: 'Dr. B',
            idMobilemed: 102,
            arranjos: [{ ...arranjo, especialidadeId: 'outra' }],
          },
        ],
      };
      const id = await criarELer();
      const e1 = designacao('e1')?.id ?? '';
      const b = await casos.explicar.executar(id, e1, 'B');
      expect(b.pegou).toBe(false);
      expect(b.titulo).toMatch(/arranjo|lauda/i);
      expect(b.checks.at(-1)).toMatchObject({ ok: false });
      const a = await casos.explicar.executar(id, e1, 'A');
      expect(a.pegou).toBe(true);
      expect(a.checks.every((c) => c.ok)).toBe(true);
      const c = await casos.explicar.executar(id, e1, 'C');
      expect(c.checks[0]).toMatchObject({ ok: false, titulo: 'Habilitado no robô' });
    });

    it('médico sem conta na MobileMed não recebe: sai no funil e no "por quê"', async () => {
      insumos.insumos = {
        ...insumosBase(),
        medicos: [
          insumosBase().medicos[0] as never,
          { id: 'B', nome: 'Dr. B', idMobilemed: null, arranjos: [arranjo] },
        ],
      };
      const id = await criarELer();
      expect(repo.designacoesGravadas.filter((d) => d.medicoId === 'B')).toEqual([]);
      expect(designacao('e1')?.medicoId).toBe('A');
      const resumo = await casos.resumo.executar(id);
      expect(resumo.funilMedicos).toMatchObject({ noHorario: 2, comConta: 1, receberam: 1 });
      const b = await casos.explicar.executar(id, designacao('e1')?.id ?? '', 'B');
      expect(b.pegou).toBe(false);
      expect(b.titulo).toMatch(/conta na MobileMed/);
      expect(b.checks.at(-1)).toMatchObject({ ok: false, titulo: 'Tem conta na MobileMed' });
    });

    it('só médico sem conta na MobileMed em turno: o exame sai explicado e com aviso', async () => {
      insumos.insumos = {
        ...insumosBase(),
        medicos: [{ id: 'B', nome: 'Dr. B', idMobilemed: null, arranjos: [arranjo] }],
      };
      const id = await criarELer();
      expect(designacao('e1')).toMatchObject({ status: 'recusada', motivo: 'sem_medico_elegivel' });
      expect(designacao('e1')?.detalhe).toMatch(/conta na MobileMed/);
      expect(repo.rodadas.get(id)?.avisos.some((a) => /conta na MobileMed/.test(a))).toBe(true);
    });

    it('fila do momento: por frente e prioridade, vencimentos, turnos e habilitados', async () => {
      mobilemed.leitura = {
        semMedico: [
          exame({ idExame: 'v1', prazo: br('2026-11-18T09:40') }),
          exame({ idExame: 'v2', prioridade: 'Urgência', prazo: br('2026-11-18T09:20') }),
          exame({ idExame: 'v3' }),
          exame({ idExame: 'v4', estudo: 'ESTUDO SEM CADASTRO' }),
        ],
        emMaos: [],
      };
      insumos.insumos = { ...insumosBase(), nomes: { [MI]: 'MEDICINA INTERNA', manha: 'Manhã' } };
      const f = await casos.filaDoMomento.executar();
      expect(f).toMatchObject({
        roboAtivo: true,
        habilitados: 2,
        vencemProximaHora: 2,
        primeiroVencimento: br('2026-11-18T09:20'),
      });
      expect(f.porFrente).toEqual([
        expect.objectContaining({
          frenteId: 'f-mi',
          nome: 'MEDICINA INTERNA',
          exames: 3,
          urgentes: 1,
          primeiroVencimento: br('2026-11-18T09:20'),
          porPrioridade: expect.arrayContaining([
            { prioridadeOperacaoId: 'op-urg', exames: 1, urgentes: 1 },
            { prioridadeOperacaoId: 'op-rot', exames: 2, urgentes: 0 },
          ]),
        }),
        expect.objectContaining({ frenteId: null, nome: 'Sem frente', exames: 1 }),
      ]);
      expect(f.prioridades.map((p) => p.prioridadeOperacaoId)).toEqual(['op-urg', 'op-rot']);
      expect(f.turnos).toEqual([
        expect.objectContaining({ turnoId: 'manha', nome: 'Manhã', medicos: 2, emAndamento: true }),
      ]);
      expect(f.medicosEmTurno[0]).toMatchObject({ turno: 'Manhã', frenteNome: 'MEDICINA INTERNA' });
    });

    it('fila do momento: vencidos separados dos que vencem na próxima hora', async () => {
      mobilemed.leitura = {
        semMedico: [
          exame({ idExame: 'v1', prazo: br('2026-11-17T21:30') }),
          exame({ idExame: 'v2', prazo: br('2026-11-18T08:59') }),
          exame({ idExame: 'v3', prazo: br('2026-11-18T09:20') }),
          exame({ idExame: 'v4', prazo: br('2026-11-18T10:00') }),
          exame({ idExame: 'v5', prazo: br('2026-11-18T10:01') }),
          exame({ idExame: 'v6' }),
        ],
        emMaos: [],
      };
      const f = await casos.filaDoMomento.executar();
      expect(f).toMatchObject({
        vencidos: 2,
        vencemProximaHora: 2,
        primeiroVencimento: br('2026-11-17T21:30'),
        proximoVencimento: br('2026-11-18T09:20'),
      });
    });

    it('busca de médicos para a conferência: só ativos com conta na MobileMed', async () => {
      const r = await casos.buscarMedicos.executar('d');
      expect(r.map((m) => m.id)).toEqual(['A', 'B']);
      expect(r[0]).toMatchObject({ nome: 'Dra. A', habilitadoRobo: true });
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

    it('fila do momento: quem está em turno com a frente, as cores e os segmentos que cobre', async () => {
      insumos.insumos = {
        ...insumosBase(),
        ocorrencias: [oc('A', { subespecialidadeIds: ['seg-1'] }), oc('B')],
        nomes: { [MI]: 'NEURO', manha: 'Manhã', 'seg-1': 'Cabeça e pescoço', 'seg-2': 'AVC' },
        cores: { manha: '#2F6FB2', [MI]: '#7A5AB5', 'seg-1': '#3E8E5E' },
        segmentos: { [MI]: ['seg-1', 'seg-2'] },
      };
      const f = await casos.filaDoMomento.executar();
      const de = (id: string) => f.medicosEmTurno.find((m) => m.medicoId === id);
      expect(de('A')).toMatchObject({
        frenteId: 'f-mi',
        turnoCor: '#2F6FB2',
        frenteCor: '#7A5AB5',
        segmentosRecortados: true,
        segmentos: [{ id: 'seg-1', nome: 'Cabeça e pescoço', cor: '#3E8E5E' }],
      });
      expect(de('B')).toMatchObject({
        segmentosRecortados: false,
        segmentos: [
          { id: 'seg-1', nome: 'Cabeça e pescoço', cor: '#3E8E5E' },
          { id: 'seg-2', nome: 'AVC', cor: null },
        ],
      });
      expect(f.turnos[0]).toMatchObject({ turnoId: 'manha', cor: '#2F6FB2' });
    });

    it('fila do momento: frente de modalidade não cobre segmento; só o geral também não', async () => {
      insumos.insumos = {
        ...insumosBase(),
        frentes: {
          'f-mi': { tipo: 'especialidade', especialidadeId: MI, modalidadeId: null },
          'f-ct': { tipo: 'modalidade', especialidadeId: null, modalidadeId: 'mod-ct' },
        },
        ocorrencias: [
          oc('A', {
            frente: { tipo: 'modalidade', especialidadeId: null, modalidadeId: 'mod-ct' },
          }),
          oc('B', { subespecialidadeGeral: true }),
        ],
        segmentos: { [MI]: ['seg-1'] },
      };
      const f = await casos.filaDoMomento.executar();
      const de = (id: string) => f.medicosEmTurno.find((m) => m.medicoId === id);
      expect(de('A')).toMatchObject({ frenteId: 'f-ct', frenteCor: null, segmentos: [] });
      expect(de('B')).toMatchObject({ segmentosRecortados: true, segmentos: [] });
    });
  });
});
