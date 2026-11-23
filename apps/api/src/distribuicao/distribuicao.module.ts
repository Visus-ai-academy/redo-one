import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AUDITORIA, type Auditoria } from '../auditoria/auditoria';
import { RegistroTarefas } from '../comum/jobs/registro-tarefas';
import { ClienteMobileMed } from '../comum/mobilemed/cliente-mobilemed';
import { TOKEN_MOBILEMED, type TokenMobileMed } from '../comum/mobilemed/token-mobilemed';
import { OcorrenciasModule } from '../escala/ocorrencias/ocorrencias.module';
import { HmacPseudonimizador } from '../ingestao/infrastructure/seguranca/hmac-pseudonimizador';
import {
  AJUSTES_DIA_REPOSITORY,
  type AjustesDiaRepository,
} from './application/ports/ajustes-dia.repository';
import {
  ARRANJOS_REPOSITORY,
  type ArranjosRepository,
} from './application/ports/arranjos.repository';
import { ATRIBUIDOR_EXAMES, type AtribuidorExames } from './application/ports/atribuidor-exames';
import { AVISOS_PRIORIDADE, type AvisosPrioridade } from './application/ports/avisos-prioridade';
import {
  CADASTROS_DISTRIBUICAO,
  type CadastrosDistribuicao,
} from './application/ports/cadastros-distribuicao';
import {
  CONFIGURACAO_DISTRIBUICAO_REPOSITORY,
  type ConfiguracaoDistribuicaoRepository,
} from './application/ports/configuracao-distribuicao.repository';
import { CONSULTA_RODADAS, type ConsultaRodadas } from './application/ports/consulta-rodadas';
import { ESCALA_DO_AJUSTE, type EscalaDoAjuste } from './application/ports/escala-do-ajuste';
import { FILA_EXAMES, type FilaExames } from './application/ports/fila-exames';
import {
  ESCALA_RECOLHIMENTO,
  ESCOPO_RODADA,
  type EscalaRecolhimento,
  type EscopoRodada,
  INSUMOS_RODADA,
  type LeitorInsumosRodada,
  MEDICOS_RODADA,
  type MedicosRodada,
  PSEUDONIMIZADOR_PACIENTE,
  type PseudonimizadorPaciente,
} from './application/ports/insumos-rodada';
import {
  NOMES_PACIENTES_RODADA,
  type NomesPacientesRodada,
} from './application/ports/nomes-pacientes-rodada';
import {
  PARAMETROS_EQUIPE_REPOSITORY,
  type ParametrosEquipeRepository,
} from './application/ports/parametros-equipe.repository';
import {
  PARAMETROS_MEDICO_REPOSITORY,
  type ParametrosMedicoRepository,
} from './application/ports/parametros-medico.repository';
import {
  PRIORIDADES_CLIENTE_REPOSITORY,
  type PrioridadesClienteRepository,
} from './application/ports/prioridades-cliente.repository';
import {
  PRIORIDADES_OPERACAO_REPOSITORY,
  type PrioridadesOperacaoRepository,
} from './application/ports/prioridades-operacao.repository';
import {
  REGRAS_FRENTE_REPOSITORY,
  type RegrasFrenteRepository,
} from './application/ports/regras-frente.repository';
import {
  RETRATO_FILA_REPOSITORY,
  type RetratoFilaRepository,
} from './application/ports/retrato-fila.repository';
import { RODADAS_REPOSITORY, type RodadasRepository } from './application/ports/rodadas.repository';
import {
  TAREFA_AGENDAR_RETRATO_FILA,
  TAREFA_EXECUTAR_RODADA,
  TAREFA_LER_FILA,
  TAREFA_LER_RETRATO_FILA,
} from './application/tarefas';
import {
  DefinirAjusteDia,
  ListarAjustesDia,
  ObterAjusteDia,
} from './application/use-cases/ajuste-dia';
import { ConsultarArranjos, SalvarArranjos } from './application/use-cases/arranjos';
import {
  DefinirConfiguracaoGlobal,
  ObterConfiguracaoGlobal,
} from './application/use-cases/configuracao-global';
import {
  DefinirPrioridadesCliente,
  ObterPrioridadesCliente,
} from './application/use-cases/prioridades-cliente';
import {
  CriarPrioridadeOperacao,
  DefinirGradeRecebimento,
  EditarPrioridadeOperacao,
  ExcluirPrioridadeOperacao,
  ListarPrioridadesOperacao,
  ObterGradeRecebimento,
} from './application/use-cases/prioridades-operacao';
import {
  DefinirRegrasFrente,
  ListarRegrasFrente,
  ObterRegrasFrente,
} from './application/use-cases/regras-frente';
import {
  AgendarLeituraFila,
  ConsultarRetratoFila,
  LerRetratoFila,
  PedirLeituraFila,
} from './application/use-cases/retrato-fila';
import { DefinirRoboMedico, ObterRoboMedico } from './application/use-cases/robo-medico';
import {
  AjustarMedicosRodada,
  AjustarProposta,
  AprovarRodada,
  BuscarMedicosDaRodada,
  CancelarRodada,
  ConsultarFilaDoMomento,
  ConsultarResumo,
  ConsultarRodada,
  ConsultarSituacao,
  CriarRodada,
  type DependenciasRodada,
  EncerrarRodada,
  ExecutarRodada,
  ExplicarDesignacao,
  LerFila,
  ListarDesignacoes,
  PausarRodada,
  PreverRecolhimento,
  RelerRodada,
  RetomarRodada,
} from './application/use-cases/rodadas';
import { SugerirAlocacao } from './application/use-cases/sugerir-alocacao';
import { DefinirUsoEquipe, ObterUsoEquipe } from './application/use-cases/uso-equipe';
import { EscalaDoAjusteAdapter } from './infrastructure/escala/escala-do-ajuste.adapter';
import { EscopoRodadaAdapter } from './infrastructure/escala/escopo-rodada.adapter';
import { AjustesDiaController } from './infrastructure/http/ajuste-dia.controller';
import {
  DistribuicaoEquipeController,
  DistribuicaoMedicoController,
  SugestaoAlocacaoController,
} from './infrastructure/http/arranjos.controller';
import { ConfiguracaoDistribuicaoController } from './infrastructure/http/configuracao.controller';
import { PrioridadesClienteController } from './infrastructure/http/prioridades-cliente.controller';
import {
  GradeRecebimentoController,
  PrioridadesOperacaoController,
} from './infrastructure/http/prioridades-operacao.controller';
import { RegrasFrenteController } from './infrastructure/http/regras-frente.controller';
import { RodadasController } from './infrastructure/http/rodadas.controller';
import { AvisosPrioridadeAdapter } from './infrastructure/ingestao/avisos-prioridade.adapter';
import { NomesPacientesEmMemoria } from './infrastructure/memoria/nomes-pacientes-em-memoria';
import { DrizzleAmostraCatalogo } from './infrastructure/mobilemed/drizzle-amostra-catalogo';
import { MobileMedFake } from './infrastructure/mobilemed/mobilemed-fake';
import { MobileMedReal } from './infrastructure/mobilemed/mobilemed-real';
import { DrizzleAjustesDiaRepository } from './infrastructure/persistence/drizzle-ajustes-dia.repository';
import { DrizzleArranjosRepository } from './infrastructure/persistence/drizzle-arranjos.repository';
import { DrizzleCadastrosDistribuicao } from './infrastructure/persistence/drizzle-cadastros-distribuicao';
import { DrizzleConfiguracaoDistribuicaoRepository } from './infrastructure/persistence/drizzle-configuracao-distribuicao.repository';
import { DrizzleEscalaRecolhimento } from './infrastructure/persistence/drizzle-escala-recolhimento';
import { DrizzleInsumosRodada } from './infrastructure/persistence/drizzle-insumos-rodada';
import { DrizzleMedicosRodada } from './infrastructure/persistence/drizzle-medicos-rodada';
import { DrizzleParametrosEquipeRepository } from './infrastructure/persistence/drizzle-parametros-equipe.repository';
import { DrizzleParametrosMedicoRepository } from './infrastructure/persistence/drizzle-parametros-medico.repository';
import { DrizzlePrioridadesClienteRepository } from './infrastructure/persistence/drizzle-prioridades-cliente.repository';
import { DrizzlePrioridadesOperacaoRepository } from './infrastructure/persistence/drizzle-prioridades-operacao.repository';
import { DrizzleRegrasFrenteRepository } from './infrastructure/persistence/drizzle-regras-frente.repository';
import { DrizzleRetratoFilaRepository } from './infrastructure/persistence/drizzle-retrato-fila.repository';
import { DrizzleRodadasRepository } from './infrastructure/persistence/drizzle-rodadas.repository';

const agora = () => new Date();

const DEPENDENCIAS_RODADA = Symbol('DEPENDENCIAS_RODADA');
const MOBILEMED = Symbol('MOBILEMED');

/** Inteiro da variável de ambiente (já validada na subida) ou o padrão. */
const inteiro = (config: ConfigService, nome: string, padrao: number) => {
  const v = config.get<string>(nome);
  return v ? Number(v) : padrao;
};

/** Casos de uso da rodada: todos dividem as mesmas portas. */
const CASOS_RODADA = [
  CriarRodada,
  LerFila,
  AjustarProposta,
  AprovarRodada,
  ExecutarRodada,
  PausarRodada,
  RetomarRodada,
  EncerrarRodada,
  CancelarRodada,
  RelerRodada,
  AjustarMedicosRodada,
  ConsultarSituacao,
  ConsultarRodada,
  ListarDesignacoes,
  ConsultarFilaDoMomento,
  ConsultarResumo,
  ExplicarDesignacao,
  BuscarMedicosDaRodada,
  PreverRecolhimento,
];

/** Contexto `distribuicao` (hexagonal): arranjos, parâmetros, configuração e rodadas do robô. */
@Module({
  imports: [OcorrenciasModule],
  controllers: [
    RodadasController,
    DistribuicaoMedicoController,
    DistribuicaoEquipeController,
    SugestaoAlocacaoController,
    ConfiguracaoDistribuicaoController,
    PrioridadesOperacaoController,
    GradeRecebimentoController,
    RegrasFrenteController,
    PrioridadesClienteController,
    AjustesDiaController,
  ],
  providers: [
    DrizzleRodadasRepository,
    { provide: RODADAS_REPOSITORY, useExisting: DrizzleRodadasRepository },
    { provide: CONSULTA_RODADAS, useExisting: DrizzleRodadasRepository },
    { provide: INSUMOS_RODADA, useClass: DrizzleInsumosRodada },
    { provide: ESCALA_RECOLHIMENTO, useClass: DrizzleEscalaRecolhimento },
    { provide: MEDICOS_RODADA, useClass: DrizzleMedicosRodada },
    { provide: ESCOPO_RODADA, useClass: EscopoRodadaAdapter },
    { provide: AVISOS_PRIORIDADE, useClass: AvisosPrioridadeAdapter },
    DrizzleAmostraCatalogo,
    {
      // Fake (padrão) ou a MobileMed de verdade: só `DISTRIBUICAO_MOBILEMED=real` liga a integração.
      provide: MOBILEMED,
      inject: [DrizzleAmostraCatalogo, ConfigService, TOKEN_MOBILEMED],
      useFactory: (
        amostra: DrizzleAmostraCatalogo,
        config: ConfigService,
        token: TokenMobileMed,
      ) => {
        if (config.get<string>('DISTRIBUICAO_MOBILEMED') === 'real') {
          const timeoutMs = inteiro(config, 'MOBILEMED_TIMEOUT_MS', 90_000);
          const cliente = new ClienteMobileMed({
            baseUrl: (
              config.get<string>('MOBILEMED_PORTAL_API_URL') ||
              'https://gateway-sa.mobilemed.com.br/portal-api'
            ).replace(/\/+$/, ''),
            token,
            timeoutMs,
            concorrencia: inteiro(config, 'MOBILEMED_CONCORRENCIA', 1),
            limiteAnomalias: inteiro(config, 'MOBILEMED_LIMITE_ANOMALIAS', 2),
          });
          return new MobileMedReal(cliente, {
            porPagina: inteiro(config, 'MOBILEMED_PAGINA', 1_000),
            maximoExames: inteiro(config, 'MOBILEMED_MAXIMO_EXAMES', 20_000),
          });
        }
        return new MobileMedFake(() => amostra.carregar(), agora, {
          tamanho: inteiro(config, 'DISTRIBUICAO_FAKE_TAMANHO', 300),
          semente: inteiro(config, 'DISTRIBUICAO_FAKE_SEMENTE', 1),
          falhasPct: inteiro(config, 'DISTRIBUICAO_FAKE_FALHAS_PCT', 0),
          porForaPct: inteiro(config, 'DISTRIBUICAO_FAKE_POR_FORA_PCT', 0),
          abertosPct: inteiro(config, 'DISTRIBUICAO_FAKE_ABERTOS_PCT', 0),
        });
      },
    },
    { provide: FILA_EXAMES, useExisting: MOBILEMED },
    { provide: ATRIBUIDOR_EXAMES, useExisting: MOBILEMED },
    {
      provide: PSEUDONIMIZADOR_PACIENTE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new HmacPseudonimizador(config.get<string>('PACIENTE_HMAC_SEGREDO') ?? ''),
    },
    // Um só por processo: os nomes vivem na memória da API (singleton do módulo).
    { provide: NOMES_PACIENTES_RODADA, useValue: new NomesPacientesEmMemoria() },
    {
      provide: DEPENDENCIAS_RODADA,
      inject: [
        RODADAS_REPOSITORY,
        CONSULTA_RODADAS,
        FILA_EXAMES,
        ATRIBUIDOR_EXAMES,
        INSUMOS_RODADA,
        ESCALA_RECOLHIMENTO,
        MEDICOS_RODADA,
        ESCOPO_RODADA,
        CONFIGURACAO_DISTRIBUICAO_REPOSITORY,
        PRIORIDADES_CLIENTE_REPOSITORY,
        PSEUDONIMIZADOR_PACIENTE,
        AVISOS_PRIORIDADE,
        NOMES_PACIENTES_RODADA,
        AUDITORIA,
      ],
      useFactory: (
        rodadas: RodadasRepository,
        consulta: ConsultaRodadas,
        fila: FilaExames,
        atribuidor: AtribuidorExames,
        insumos: LeitorInsumosRodada,
        escalaRecolhimento: EscalaRecolhimento,
        medicos: MedicosRodada,
        escopo: EscopoRodada,
        configuracao: ConfiguracaoDistribuicaoRepository,
        prioridadesCliente: PrioridadesClienteRepository,
        pseudonimizador: PseudonimizadorPaciente,
        avisosPrioridade: AvisosPrioridade,
        nomesPacientes: NomesPacientesRodada,
        auditoria: Auditoria,
      ): DependenciasRodada => ({
        rodadas,
        consulta,
        fila,
        atribuidor,
        insumos,
        escalaRecolhimento,
        medicos,
        escopo,
        configuracao,
        prioridadesCliente,
        pseudonimizador,
        avisosPrioridade,
        nomesPacientes,
        auditoria,
        agora,
      }),
    },
    ...CASOS_RODADA.map((Caso) => ({
      provide: Caso,
      inject: [DEPENDENCIAS_RODADA],
      useFactory: (d: DependenciasRodada) => new Caso(d),
    })),
    { provide: RETRATO_FILA_REPOSITORY, useClass: DrizzleRetratoFilaRepository },
    {
      provide: LerRetratoFila,
      inject: [ConsultarFilaDoMomento, RETRATO_FILA_REPOSITORY],
      useFactory: (montar: ConsultarFilaDoMomento, repo: RetratoFilaRepository) =>
        new LerRetratoFila(montar, repo, agora),
    },
    {
      provide: PedirLeituraFila,
      inject: [RETRATO_FILA_REPOSITORY],
      useFactory: (repo: RetratoFilaRepository) => new PedirLeituraFila(repo, agora),
    },
    {
      provide: AgendarLeituraFila,
      inject: [CONFIGURACAO_DISTRIBUICAO_REPOSITORY, RETRATO_FILA_REPOSITORY],
      useFactory: (configuracao: ConfiguracaoDistribuicaoRepository, repo: RetratoFilaRepository) =>
        new AgendarLeituraFila(configuracao, repo, agora),
    },
    {
      provide: ConsultarRetratoFila,
      inject: [RETRATO_FILA_REPOSITORY, CONFIGURACAO_DISTRIBUICAO_REPOSITORY],
      useFactory: (repo: RetratoFilaRepository, configuracao: ConfiguracaoDistribuicaoRepository) =>
        new ConsultarRetratoFila(repo, configuracao),
    },
    { provide: AJUSTES_DIA_REPOSITORY, useClass: DrizzleAjustesDiaRepository },
    { provide: ESCALA_DO_AJUSTE, useClass: EscalaDoAjusteAdapter },
    {
      provide: ObterAjusteDia,
      inject: [AJUSTES_DIA_REPOSITORY, ESCALA_DO_AJUSTE],
      useFactory: (repo: AjustesDiaRepository, escala: EscalaDoAjuste) =>
        new ObterAjusteDia(repo, escala),
    },
    {
      provide: ListarAjustesDia,
      inject: [AJUSTES_DIA_REPOSITORY, ESCALA_DO_AJUSTE],
      useFactory: (repo: AjustesDiaRepository, escala: EscalaDoAjuste) =>
        new ListarAjustesDia(repo, escala),
    },
    {
      provide: DefinirAjusteDia,
      inject: [AJUSTES_DIA_REPOSITORY, ESCALA_DO_AJUSTE, CADASTROS_DISTRIBUICAO, AUDITORIA],
      useFactory: (
        repo: AjustesDiaRepository,
        escala: EscalaDoAjuste,
        cadastros: CadastrosDistribuicao,
        auditoria: Auditoria,
      ) => new DefinirAjusteDia(repo, escala, cadastros, auditoria, agora),
    },
    { provide: PRIORIDADES_CLIENTE_REPOSITORY, useClass: DrizzlePrioridadesClienteRepository },
    {
      provide: ObterPrioridadesCliente,
      inject: [PRIORIDADES_CLIENTE_REPOSITORY, CADASTROS_DISTRIBUICAO],
      useFactory: (repo: PrioridadesClienteRepository, cadastros: CadastrosDistribuicao) =>
        new ObterPrioridadesCliente(repo, cadastros),
    },
    {
      provide: DefinirPrioridadesCliente,
      inject: [PRIORIDADES_CLIENTE_REPOSITORY, CADASTROS_DISTRIBUICAO, AUDITORIA],
      useFactory: (
        repo: PrioridadesClienteRepository,
        cadastros: CadastrosDistribuicao,
        auditoria: Auditoria,
      ) => new DefinirPrioridadesCliente(repo, cadastros, auditoria, agora),
    },
    { provide: REGRAS_FRENTE_REPOSITORY, useClass: DrizzleRegrasFrenteRepository },
    {
      provide: ObterRegrasFrente,
      inject: [REGRAS_FRENTE_REPOSITORY, CADASTROS_DISTRIBUICAO],
      useFactory: (repo: RegrasFrenteRepository, cadastros: CadastrosDistribuicao) =>
        new ObterRegrasFrente(repo, cadastros),
    },
    {
      provide: ListarRegrasFrente,
      inject: [REGRAS_FRENTE_REPOSITORY],
      useFactory: (repo: RegrasFrenteRepository) => new ListarRegrasFrente(repo),
    },
    {
      provide: DefinirRegrasFrente,
      inject: [REGRAS_FRENTE_REPOSITORY, CADASTROS_DISTRIBUICAO, AUDITORIA],
      useFactory: (
        repo: RegrasFrenteRepository,
        cadastros: CadastrosDistribuicao,
        auditoria: Auditoria,
      ) => new DefinirRegrasFrente(repo, cadastros, auditoria, agora),
    },
    { provide: PRIORIDADES_OPERACAO_REPOSITORY, useClass: DrizzlePrioridadesOperacaoRepository },
    {
      provide: ListarPrioridadesOperacao,
      inject: [PRIORIDADES_OPERACAO_REPOSITORY],
      useFactory: (repo: PrioridadesOperacaoRepository) => new ListarPrioridadesOperacao(repo),
    },
    ...[CriarPrioridadeOperacao, EditarPrioridadeOperacao, ExcluirPrioridadeOperacao].map(
      (Caso) => ({
        provide: Caso,
        inject: [PRIORIDADES_OPERACAO_REPOSITORY, AUDITORIA],
        useFactory: (repo: PrioridadesOperacaoRepository, auditoria: Auditoria) =>
          new Caso(repo, auditoria, agora),
      }),
    ),
    {
      provide: ObterGradeRecebimento,
      inject: [PRIORIDADES_OPERACAO_REPOSITORY],
      useFactory: (repo: PrioridadesOperacaoRepository) => new ObterGradeRecebimento(repo),
    },
    {
      provide: DefinirGradeRecebimento,
      inject: [PRIORIDADES_OPERACAO_REPOSITORY, CADASTROS_DISTRIBUICAO, AUDITORIA],
      useFactory: (
        repo: PrioridadesOperacaoRepository,
        cadastros: CadastrosDistribuicao,
        auditoria: Auditoria,
      ) => new DefinirGradeRecebimento(repo, cadastros, auditoria, agora),
    },
    {
      provide: CONFIGURACAO_DISTRIBUICAO_REPOSITORY,
      useClass: DrizzleConfiguracaoDistribuicaoRepository,
    },
    {
      provide: ObterConfiguracaoGlobal,
      inject: [CONFIGURACAO_DISTRIBUICAO_REPOSITORY],
      useFactory: (repo: ConfiguracaoDistribuicaoRepository) => new ObterConfiguracaoGlobal(repo),
    },
    {
      provide: DefinirConfiguracaoGlobal,
      inject: [CONFIGURACAO_DISTRIBUICAO_REPOSITORY, CADASTROS_DISTRIBUICAO, AUDITORIA],
      useFactory: (
        repo: ConfiguracaoDistribuicaoRepository,
        cadastros: CadastrosDistribuicao,
        auditoria: Auditoria,
      ) => new DefinirConfiguracaoGlobal(repo, cadastros, auditoria, agora),
    },
    { provide: ARRANJOS_REPOSITORY, useClass: DrizzleArranjosRepository },
    { provide: PARAMETROS_MEDICO_REPOSITORY, useClass: DrizzleParametrosMedicoRepository },
    { provide: PARAMETROS_EQUIPE_REPOSITORY, useClass: DrizzleParametrosEquipeRepository },
    { provide: CADASTROS_DISTRIBUICAO, useClass: DrizzleCadastrosDistribuicao },
    {
      provide: ConsultarArranjos,
      inject: [ARRANJOS_REPOSITORY, CADASTROS_DISTRIBUICAO, PRIORIDADES_OPERACAO_REPOSITORY],
      useFactory: (
        arranjos: ArranjosRepository,
        cadastros: CadastrosDistribuicao,
        prioridades: PrioridadesOperacaoRepository,
      ) => new ConsultarArranjos(arranjos, cadastros, prioridades),
    },
    {
      provide: SalvarArranjos,
      inject: [ARRANJOS_REPOSITORY, CADASTROS_DISTRIBUICAO, AUDITORIA],
      useFactory: (
        arranjos: ArranjosRepository,
        cadastros: CadastrosDistribuicao,
        auditoria: Auditoria,
      ) => new SalvarArranjos(arranjos, cadastros, auditoria, agora),
    },
    {
      provide: ObterRoboMedico,
      inject: [PARAMETROS_MEDICO_REPOSITORY, CADASTROS_DISTRIBUICAO],
      useFactory: (parametros: ParametrosMedicoRepository, cadastros: CadastrosDistribuicao) =>
        new ObterRoboMedico(parametros, cadastros),
    },
    {
      provide: DefinirRoboMedico,
      inject: [PARAMETROS_MEDICO_REPOSITORY, CADASTROS_DISTRIBUICAO, AUDITORIA],
      useFactory: (
        parametros: ParametrosMedicoRepository,
        cadastros: CadastrosDistribuicao,
        auditoria: Auditoria,
      ) => new DefinirRoboMedico(parametros, cadastros, auditoria, agora),
    },
    {
      provide: ObterUsoEquipe,
      inject: [PARAMETROS_EQUIPE_REPOSITORY, CADASTROS_DISTRIBUICAO],
      useFactory: (parametros: ParametrosEquipeRepository, cadastros: CadastrosDistribuicao) =>
        new ObterUsoEquipe(parametros, cadastros),
    },
    {
      provide: DefinirUsoEquipe,
      inject: [PARAMETROS_EQUIPE_REPOSITORY, CADASTROS_DISTRIBUICAO, AUDITORIA],
      useFactory: (
        parametros: ParametrosEquipeRepository,
        cadastros: CadastrosDistribuicao,
        auditoria: Auditoria,
      ) => new DefinirUsoEquipe(parametros, cadastros, auditoria, agora),
    },
    {
      provide: SugerirAlocacao,
      inject: [ARRANJOS_REPOSITORY, CADASTROS_DISTRIBUICAO],
      useFactory: (arranjos: ArranjosRepository, cadastros: CadastrosDistribuicao) =>
        new SugerirAlocacao(arranjos, cadastros),
    },
  ],
})
export class DistribuicaoModule implements OnModuleInit {
  private readonly logger = new Logger(DistribuicaoModule.name);

  constructor(
    private readonly registro: RegistroTarefas,
    private readonly lerFila: LerFila,
    private readonly executarRodada: ExecutarRodada,
    private readonly lerRetrato: LerRetratoFila,
    private readonly agendarRetrato: AgendarLeituraFila,
  ) {}

  onModuleInit() {
    const rodadaDo = (tarefa: string, payload: unknown) => {
      const id = (payload as { rodadaId?: unknown } | null)?.rodadaId;
      if (typeof id !== 'string') throw new Error(`${tarefa}: payload inválido`);
      return id;
    };
    this.registro.registrar(TAREFA_LER_FILA, (payload) =>
      this.lerFila.executar(rodadaDo(TAREFA_LER_FILA, payload)),
    );
    this.registro.registrar(TAREFA_EXECUTAR_RODADA, (payload) =>
      this.executarRodada.executar(rodadaDo(TAREFA_EXECUTAR_RODADA, payload)),
    );
    this.registro.registrar(TAREFA_LER_RETRATO_FILA, async () => {
      const erro = await this.lerRetrato.executar();
      // A mensagem das portas não traz dado de paciente.
      if (erro) this.logger.warn(`Leitura do retrato da fila falhou: ${erro}`);
    });
    this.registro.registrar(TAREFA_AGENDAR_RETRATO_FILA, async () => {
      await this.agendarRetrato.executar();
    });
    // A cada minuto; o intervalo de verdade vem de Configurações › Distribuição.
    this.registro.agendar(TAREFA_AGENDAR_RETRATO_FILA, '* * * * *');
  }
}
