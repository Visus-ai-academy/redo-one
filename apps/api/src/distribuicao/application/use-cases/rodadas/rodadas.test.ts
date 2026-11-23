import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../../auditoria/testing';
import type { Arranjo } from '../../../domain/arranjo';
import { CONFIGURACAO_INICIAL, type ConfiguracaoGlobal } from '../../../domain/configuracao-global';
import { REGRAS_NEUTRAS } from '../../../domain/motor/configuracao';
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
  AvisosPrioridadeEmMemoria,
  EscalaRecolhimentoEmMemoria,
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
import type { ExameComDono, FilaExames, LeituraFila } from '../../ports/fila-exames';
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
  async intocados(exames: readonly ExameComDono[]) {
    return new Set(exames.map((e) => e.idExame).filter((id) => !this.atribuidosPorFora.has(id)));
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
    furaGradeNaAlocacao: false,
    urgencia,
    padrao: id === 'op-rot',
    grafias: [g],
    cor: id === 'op-urg' ? '#B5535A' : null,
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
  let avisosPrioridade: AvisosPrioridadeEmMemoria;
  let escalaRecolhimento: EscalaRecolhimentoEmMemoria;
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
    escalaRecolhimento = new EscalaRecolhimentoEmMemoria();
    avisosPrioridade = new AvisosPrioridadeEmMemoria();
    casos = criarCasosDeUsoRodada({
      rodadas: repo,
      consulta: repo,
      fila: mobilemed,
      atribuidor: mobilemed,
      insumos,
      escalaRecolhimento,
      medicos,
      escopo,
      configuracao,
      prioridadesCliente: new PrioridadesClienteEmMemoria(),
      pseudonimizador: { pseudonimo: (t) => `hmac(${t})` },
      avisosPrioridade,
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

    it('grafia de prioridade sem de-para vira aviso, um só por grafia, e o de-para o resolve', async () => {
      mobilemed.leitura.semMedico.push(
        exame({ idExame: 'e4', prioridade: 'Eletivo' }),
        exame({ idExame: 'e5', prioridade: 'ELETIVO' }),
      );
      const id = await criarELer();
      expect([...avisosPrioridade.avisos.values()]).toEqual([
        { chave: 'ELETIVO', valor: 'Eletivo', exames: 2, status: 'pendente' },
      ]);
      expect(JSON.stringify([...avisosPrioridade.avisos.values()])).not.toMatch(/Fict/);
      await casos.cancelar.executar(admin, id);
      insumos.insumos = {
        ...insumos.insumos,
        prioridadesOperacao: [
          ...insumos.insumos.prioridadesOperacao,
          op('op-ele', 3, { tipo: 'nunca' }, 'Eletivo'),
        ],
      };
      await criarELer();
      expect(avisosPrioridade.avisos.get('ELETIVO')?.status).toBe('resolvido');
    });

    it('falha ao registrar o aviso não derruba a proposta', async () => {
      avisosPrioridade.falha = new Error('banco fora');
      mobilemed.leitura.semMedico.push(exame({ idExame: 'e4', prioridade: 'Eletivo' }));
      const id = await criarELer();
      expect(repo.rodadas.get(id)?.status).toBe('aguardando_aprovacao');
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

    it('a proposta inteira: só as previstas, na ordem, com a frente e sem o nome do paciente', async () => {
      repo.frentesDaEscala = [
        { id: 'f-mi', especialidadeId: MI, modalidadeId: null, cor: '#5B7DB1' },
      ];
      const id = await criarELer();
      const { itens } = await casos.designacoes.proposta(id);
      expect(itens.length).toBe(2);
      expect(itens.every((d) => d.status === 'prevista' && d.nomePaciente === null)).toBe(true);
      expect(itens.map((d) => d.ordem)).toEqual(
        [...itens.map((d) => d.ordem)].sort((a, b) => a - b),
      );
      expect(itens[0]?.frente).toEqual({ id: 'f-mi', nome: MI, cor: '#5B7DB1' });
      expect(auditoria.eventos.some((e) => e.acao === 'paciente_lido')).toBe(false);
    });

    it('na proposta, o exame fica numa frente marcada na rodada (só a de modalidade: nela)', async () => {
      repo.frentesDaEscala = [
        { id: 'f-mi', especialidadeId: MI, modalidadeId: null, cor: '#5B7DB1' },
        { id: 'f-ct', especialidadeId: null, modalidadeId: CT, cor: '#8A6FB0' },
      ];
      const id = await criarELer();
      const r = repo.rodadas.get(id);
      if (r) r.recortes = { ...r.recortes, frenteIds: ['f-ct'] };
      const { itens } = await casos.designacoes.proposta(id);
      expect(itens[0]?.frente).toEqual({ id: 'f-ct', nome: CT, cor: '#8A6FB0' });
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

    it('o turno que ainda vai começar hoje aparece "a começar" no resumo e no "por quê"', async () => {
      // Às 09:00, a Tarde de B começa às 11:00 (dentro da antecedência: ele recebe).
      insumos.insumos = {
        ...insumosBase(),
        ocorrencias: [
          oc('A'),
          oc('B', {
            alocacaoId: 'tarde-B',
            turnoId: 'tarde',
            inicio: br('2026-11-18T11:00'),
            fim: br('2026-11-18T19:00'),
          }),
        ],
      };
      const id = await criarELer();
      const r = await casos.resumo.executar(id);
      expect(r.medicos.find((m) => m.medicoId === 'B')).toMatchObject({
        turnos: [],
        frentes: [expect.any(String)],
        aComecar: [{ turno: 'tarde', inicio: br('2026-11-18T11:00').toISOString() }],
      });
      expect(r.medicos.find((m) => m.medicoId === 'A')).toMatchObject({ aComecar: [] });
      const b = await casos.explicar.executar(id, designacao('e1')?.id ?? '', 'B');
      expect(b.checks.find((c) => c.titulo === 'Em turno na rodada')).toMatchObject({
        ok: true,
        detalhe: expect.stringMatching(/^tarde \(começa 11:00\)/),
      });
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
      expect(f.prioridades.map((p) => [p.prioridadeOperacaoId, p.cor])).toEqual([
        ['op-urg', '#B5535A'],
        ['op-rot', null],
      ]);
      expect(f.turnos).toEqual([
        expect.objectContaining({ turnoId: 'manha', nome: 'Manhã', medicos: 2, emAndamento: true }),
      ]);
      expect(f.medicosEmTurno[0]).toMatchObject({ turno: 'Manhã', frenteNome: 'MEDICINA INTERNA' });
    });

    it('fila do momento: cada frente quebrada por segmento × prioridade; sem segmento à parte', async () => {
      // O segmento vem do catálogo do exame: TC TORAX → seg-1; TC CRANIO → seg-2; RX → sem.
      insumos.catalogo = {
        ...catalogo,
        classificar: (e) => ({
          ...catalogo.classificar(e),
          ...(e.estudo !== 'ESTUDO SEM CADASTRO' && {
            exameId: 'ex',
            especialidadeId: e.modalidade === 'MR' ? null : MI,
            modalidadeId: e.modalidade === 'MR' ? 'mod-mr' : CT,
          }),
          subespecialidadeId:
            e.estudo === 'TC TORAX' ? 'seg-1' : e.estudo === 'TC CRANIO' ? 'seg-2' : null,
        }),
      };
      mobilemed.leitura = {
        semMedico: [
          exame({ idExame: 's1' }),
          exame({ idExame: 's2', prioridade: 'Urgência' }),
          exame({ idExame: 's3', estudo: 'TC CRANIO' }),
          exame({ idExame: 's4', estudo: 'TC CRANIO' }),
          exame({ idExame: 's5', estudo: 'TC CRANIO', prioridade: 'Urgência' }),
          exame({ idExame: 's6', estudo: 'TC ABDOME' }),
          exame({ idExame: 's7', estudo: 'RM JOELHO', modalidade: 'MR' }),
        ],
        emMaos: [],
      };
      insumos.insumos = {
        ...insumosBase(),
        frentes: {
          'f-mi': { tipo: 'especialidade', especialidadeId: MI, modalidadeId: null },
          'f-mr': { tipo: 'modalidade', especialidadeId: null, modalidadeId: 'mod-mr' },
        },
        nomes: { [MI]: 'NEURO', 'mod-mr': 'RM', 'seg-1': 'Tórax', 'seg-2': 'Crânio' },
        cores: { 'seg-1': '#3E8E5E' },
        segmentos: { [MI]: ['seg-1', 'seg-2'] },
      };
      const f = await casos.filaDoMomento.executar();
      const neuro = f.porFrente.find((x) => x.frenteId === 'f-mi');
      expect(neuro?.exames).toBe(6);
      expect(neuro?.porSegmento).toEqual([
        {
          segmentoId: 'seg-2',
          nome: 'Crânio',
          cor: null,
          exames: 3,
          urgentes: 1,
          porPrioridade: expect.arrayContaining([
            { prioridadeOperacaoId: 'op-rot', exames: 2, urgentes: 0 },
            { prioridadeOperacaoId: 'op-urg', exames: 1, urgentes: 1 },
          ]),
        },
        {
          segmentoId: 'seg-1',
          nome: 'Tórax',
          cor: '#3E8E5E',
          exames: 2,
          urgentes: 1,
          porPrioridade: expect.arrayContaining([
            { prioridadeOperacaoId: 'op-rot', exames: 1, urgentes: 0 },
            { prioridadeOperacaoId: 'op-urg', exames: 1, urgentes: 1 },
          ]),
        },
        {
          segmentoId: null,
          nome: 'Sem subespecialidade',
          cor: null,
          exames: 1,
          urgentes: 0,
          porPrioridade: [{ prioridadeOperacaoId: 'op-rot', exames: 1, urgentes: 0 }],
        },
      ]);
      // Frente de modalidade não tem segmento.
      expect(f.porFrente.find((x) => x.frenteId === 'f-mr')?.porSegmento).toEqual([]);
    });

    it('fila do momento: frente de modalidade conta pela modalidade, como o recorte da rodada', async () => {
      // TC TORAX → MI + CT; TC CRANIO → sem especialidade, CT; RX → MI + RX; o resto sem catálogo.
      insumos.catalogo = {
        ...catalogo,
        classificar: (e) => ({
          ...catalogo.classificar(e),
          ...(e.estudo === 'TC CRANIO' && {
            exameId: 'ex',
            especialidadeId: null,
            modalidadeId: CT,
          }),
          ...(e.estudo === 'RX TORAX' && {
            exameId: 'ex',
            especialidadeId: MI,
            modalidadeId: 'mod-rx',
          }),
        }),
      };
      mobilemed.leitura = {
        semMedico: [
          exame({ idExame: 'm1' }),
          exame({ idExame: 'm2', prioridade: 'Urgência' }),
          exame({ idExame: 'm3', estudo: 'TC CRANIO' }),
          exame({ idExame: 'm4', estudo: 'RX TORAX', modalidade: 'CR' }),
          exame({ idExame: 'm5', estudo: 'ESTUDO SEM CADASTRO' }),
        ],
        emMaos: [],
      };
      insumos.insumos = {
        ...insumosBase(),
        frentes: {
          'f-mi': { tipo: 'especialidade', especialidadeId: MI, modalidadeId: null },
          'f-ct': { tipo: 'modalidade', especialidadeId: null, modalidadeId: CT },
          'f-rx': { tipo: 'modalidade', especialidadeId: null, modalidadeId: 'mod-rx' },
        },
        nomes: { [MI]: 'MEDICINA INTERNA', [CT]: 'TC', 'mod-rx': 'RX' },
        cores: { [MI]: '#3E8E5E', [CT]: '#5A7FB5' },
      };
      const f = await casos.filaDoMomento.executar();
      // O exame de MI em TC conta nas duas frentes (marcar só uma delas já o leva); o total não
      // soma duas vezes.
      expect(f.total).toBe(5);
      expect(f.porFrente.map((x) => [x.frenteId, x.tipo, x.nome, x.cor, x.exames])).toEqual([
        ['f-mi', 'especialidade', 'MEDICINA INTERNA', '#3E8E5E', 3],
        ['f-ct', 'modalidade', 'TC', '#5A7FB5', 3],
        ['f-rx', 'modalidade', 'RX', null, 1],
        [null, null, 'Sem frente', null, 1],
      ]);
      // Os grupos pelos eixos do recorte: cada exame uma vez, com todas as frentes que o pegam.
      expect(f.grupos).toEqual(
        expect.arrayContaining([
          {
            frenteIds: ['f-ct', 'f-mi'],
            segmentoId: null,
            prioridadeOperacaoId: 'op-rot',
            exames: 1,
          },
          {
            frenteIds: ['f-ct', 'f-mi'],
            segmentoId: null,
            prioridadeOperacaoId: 'op-urg',
            exames: 1,
          },
          { frenteIds: ['f-ct'], segmentoId: null, prioridadeOperacaoId: 'op-rot', exames: 1 },
          {
            frenteIds: ['f-mi', 'f-rx'],
            segmentoId: null,
            prioridadeOperacaoId: 'op-rot',
            exames: 1,
          },
          { frenteIds: [], segmentoId: null, prioridadeOperacaoId: 'op-rot', exames: 1 },
        ]),
      );
      expect(f.grupos.reduce((s, g) => s + g.exames, 0)).toBe(f.total);
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
  describe('recolhimento', () => {
    const MANHA_A = { medicoId: 'A', inicio: br('2026-11-18T07:00'), fim: br('2026-11-18T13:00') };
    const periodo = {
      lista: false,
      ausente: false,
      frente: { tipo: 'especialidade', especialidadeId: MI, modalidadeId: null } as const,
      subespecialidadeIds: [],
      subespecialidadeGeral: false,
    };
    const tarde = (medicoId: string) =>
      oc(medicoId, {
        alocacaoId: `tarde-${medicoId}`,
        turnoId: 'tarde',
        inicio: br('2026-11-18T13:00'),
        fim: br('2026-11-18T19:00'),
      });

    /** Rodada das 9h: o robô entrega o exame à Dra. A, que sai do turno às 13h sem abri-lo. */
    const entregarAoA = async (...ids: string[]) => {
      mobilemed.leitura = { semMedico: ids.map((idExame) => exame({ idExame })), emMaos: [] };
      const id = await criarELer({ ...RECORTES_VAZIOS, medicosExcluidos: ['B'] });
      await casos.aprovar.executar(admin, id);
      await jobs();
      expect(ids.map((x) => designacao(x)?.status)).toEqual(ids.map(() => 'executada'));
      // Na MobileMed, o exame segue NOVO com ela.
      mobilemed.leitura = {
        semMedico: [],
        emMaos: mobilemed.pedidos
          .filter((p) => ids.includes(p.idExame))
          .map((p) => {
            const { status: _, ...e } = exame({ idExame: p.idExame });
            return { ...e, status: 'NOVO', medicoIdMobilemed: p.medicoIdMobilemed };
          }),
      };
      mobilemed.pedidos = [];
      escalaRecolhimento.periodosGravados = [{ ...MANHA_A, ...periodo }];
      // 14h30: a Manhã acabou há mais que a carência (60 min); o Dr. B está na Tarde.
      agora = br('2026-11-18T14:30');
      insumos.insumos = { ...insumosBase(), ocorrencias: [tarde('B')] };
    };
    const daRodada = (rodadaId: string, idExame: string) =>
      repo.designacoesGravadas.find((d) => d.rodadaId === rodadaId && d.idExame === idExame);

    it('o exame do turno encerrado entra na proposta marcado, e só ao executar troca de médico', async () => {
      await entregarAoA('r1');
      const id = await criarELer();
      expect(daRodada(id, 'r1')).toMatchObject({
        status: 'prevista',
        medicoId: 'B',
        recolhidoDeId: 'A',
        motivoRecolhimento: 'turno_encerrado',
      });
      expect(repo.rodadas.get(id)).toMatchObject({ lidos: 0, recolhidos: 1 });
      expect(repo.insumosGravados.get(id)?.recolhimento).toMatchObject({
        recolhiveis: 1,
        propostos: 1,
        semDestino: 0,
      });
      expect(repo.diario.filter((e) => e.rodadaId === id).at(-1)?.texto).toMatch(
        /Proposta pronta: 1 de 1 exame\(s\), 1 recolhido\(s\)/,
      );
      expect((await casos.resumo.executar(id)).recolhimento).toMatchObject({
        recolhiveis: 1,
        propostos: 1,
      });
      const so = await casos.designacoes.executar(
        admin,
        id,
        { recolhido: true, pagina: 1, porPagina: 10 },
        false,
      );
      expect(so.itens.map((d) => d.recolhidoDe)).toEqual([{ id: 'A', nome: 'A' }]);
      // Na conferência nada saiu da Dra. A.
      expect(mobilemed.pedidos).toEqual([]);
      await casos.aprovar.executar(admin, id);
      await jobs();
      expect(mobilemed.pedidos).toEqual([
        { idExame: 'r1', medicoIdMobilemed: 102, deMedicoIdMobilemed: 101 },
      ]);
      expect(daRodada(id, 'r1')?.status).toBe('executada');
    });

    it('a carência vale: dentro dela o exame fica com quem tem', async () => {
      await entregarAoA('r1');
      agora = br('2026-11-18T13:59');
      const id = await criarELer();
      expect(daRodada(id, 'r1')).toBeUndefined();
      expect(repo.insumosGravados.get(id)?.recolhimento?.naoRecolhidos.turno_em_curso).toBe(1);
    });

    it('a escala é lida desde a véspera do maior fim que ainda segura (a carência da Lista)', async () => {
      await entregarAoA('r1');
      agora = br('2026-11-28T14:30');
      await criarELer();
      expect(escalaRecolhimento.pedidos.at(-1)).toEqual({
        desde: br('2026-11-26T14:30'),
        agora: br('2026-11-28T14:30'),
      });
    });

    it('a Dra. A na Tarde da mesma frente: o exame fica com ela, sem troca entre médicos em turno', async () => {
      await entregarAoA('r1');
      escalaRecolhimento.periodosGravados.push({
        ...periodo,
        medicoId: 'A',
        inicio: br('2026-11-18T13:00'),
        fim: br('2026-11-18T19:00'),
      });
      const id = await criarELer();
      expect(daRodada(id, 'r1')).toBeUndefined();
      expect(repo.insumosGravados.get(id)?.recolhimento?.naoRecolhidos.turno_em_curso).toBe(1);
    });

    it('sem ninguém para pegar, o recolhido fica com quem tem e fora da proposta', async () => {
      await entregarAoA('r1');
      insumos.insumos = { ...insumosBase(), ocorrencias: [] };
      const id = await criarELer();
      expect(daRodada(id, 'r1')).toBeUndefined();
      expect(repo.rodadas.get(id)?.recolhidos).toBe(0);
      expect(repo.insumosGravados.get(id)?.recolhimento).toMatchObject({
        recolhiveis: 1,
        propostos: 0,
        semDestino: 1,
      });
    });

    it('nunca volta a quem o tinha: a Dra. A em turno de novo não o recebe', async () => {
      await entregarAoA('r1');
      insumos.insumos = { ...insumosBase(), ocorrencias: [tarde('A')] };
      const id = await criarELer();
      expect(daRodada(id, 'r1')).toBeUndefined();
    });

    it('desligado (carência nula): nada é recolhido e o resumo não aparece', async () => {
      await entregarAoA('r1');
      insumos.insumos = {
        ...insumos.insumos,
        config: { ...CONFIGURACAO_INICIAL, recolhimentoAposTurnoMin: null },
      };
      const id = await criarELer();
      expect(daRodada(id, 'r1')).toBeUndefined();
      expect(repo.insumosGravados.get(id)?.recolhimento).toBeUndefined();
    });

    it('frente que não recolhe ao fim do turno: fica', async () => {
      await entregarAoA('r1');
      insumos.insumos = {
        ...insumos.insumos,
        regrasFrente: [
          {
            ...REGRAS_NEUTRAS,
            frente: { tipo: 'especialidade', especialidadeId: MI, modalidadeId: null },
            recolheAoFimDoTurno: false,
          },
        ],
      };
      const id = await criarELer();
      expect(daRodada(id, 'r1')).toBeUndefined();
      expect(repo.insumosGravados.get(id)?.recolhimento?.naoRecolhidos.frente_nao_recolhe).toBe(1);
    });

    it('ausência aprovada de hoje: perde o exame NOVO mesmo sem o robô ter entregue', async () => {
      mobilemed.leitura = {
        semMedico: [],
        emMaos: [{ ...exame({ idExame: 'm1' }), medicoIdMobilemed: 101 }],
      };
      escalaRecolhimento.ausencias = [{ medicoId: 'A', frentes: [] }];
      insumos.insumos = { ...insumosBase(), ocorrencias: [oc('B')] };
      const id = await criarELer();
      expect(daRodada(id, 'm1')).toMatchObject({
        medicoId: 'B',
        recolhidoDeId: 'A',
        motivoRecolhimento: 'ausencia',
      });
    });

    it('conferência: tirar deixa com quem tem; mover para quem o tinha é recusado', async () => {
      await entregarAoA('r1', 'r2');
      insumos.insumos = { ...insumosBase(), ocorrencias: [tarde('B')] };
      medicos.medicos.push({
        id: 'E',
        nome: 'Dr. E',
        ativo: true,
        habilitadoRobo: true,
        idMobilemed: 105,
      });
      const id = await criarELer();
      const r1 = daRodada(id, 'r1');
      const r2 = daRodada(id, 'r2');
      await expect(
        casos.ajustarProposta.executar(admin, id, {
          remover: [],
          mover: [{ designacaoId: r2?.id ?? '', medicoId: 'A' }],
        }),
      ).rejects.toThrow(/não volta para quem o tinha/);
      await casos.ajustarProposta.executar(admin, id, {
        remover: [r1?.id ?? ''],
        mover: [{ designacaoId: r2?.id ?? '', medicoId: 'E' }],
      });
      expect(daRodada(id, 'r1')).toMatchObject({ status: 'pulada', recolhidoDeId: 'A' });
      expect(daRodada(id, 'r2')).toMatchObject({ medicoId: 'E', recolhidoDeId: 'A' });
      await casos.aprovar.executar(admin, id);
      await jobs();
      expect(mobilemed.pedidos).toEqual([
        { idExame: 'r2', medicoIdMobilemed: 105, deMedicoIdMobilemed: 101 },
      ]);
    });

    it('a retomada confere se o recolhido segue com quem o tinha', async () => {
      await entregarAoA('r1', 'r2');
      const id = await criarELer();
      await casos.aprovar.executar(admin, id);
      mobilemed.aoAtribuir = async () => {
        mobilemed.aoAtribuir = async () => undefined;
        await casos.pausar.executar(admin, id);
      };
      await jobs();
      const conferidos: ExameComDono[] = [];
      const intocados = mobilemed.intocados.bind(mobilemed);
      mobilemed.intocados = async (exames) => {
        conferidos.push(...exames);
        return intocados(exames);
      };
      await casos.retomar.executar(admin, id);
      await jobs();
      expect(conferidos).toHaveLength(1);
      expect(conferidos[0]?.medicoIdMobilemed).toBe(101);
      expect(mobilemed.pedidos.every((p) => p.deMedicoIdMobilemed === 101)).toBe(true);
    });

    it('prévia do "Distribuir agora": quantos seriam recolhidos, sem gravar nada', async () => {
      await entregarAoA('r1');
      mobilemed.leitura.emMaos.push({ ...exame({ idExame: 'm9' }), medicoIdMobilemed: 102 });
      escalaRecolhimento.ausencias = [{ medicoId: 'B', frentes: [] }];
      const antes = repo.rodadas.size;
      expect(await casos.recolhimentoPrevisto.executar()).toEqual({
        ligado: true,
        recolhiveis: 2,
        porAusencia: 1,
      });
      expect(repo.rodadas.size).toBe(antes);
      insumos.insumos = {
        ...insumos.insumos,
        config: { ...CONFIGURACAO_INICIAL, recolhimentoAposTurnoMin: null },
      };
      expect(await casos.recolhimentoPrevisto.executar()).toEqual({
        ligado: false,
        recolhiveis: 0,
        porAusencia: 0,
      });
    });
  });
});
