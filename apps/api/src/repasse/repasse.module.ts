import { Inject, Module, type OnModuleInit } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../auditoria/auditoria';
import { RegistroTarefas } from '../comum/jobs/registro-tarefas';
import { DATABASE, type Database } from '../database/database';
import {
  RECALCULOS_COMPETENCIA,
  type RecalculosCompetencia,
} from '../faturamento/application/ports/recalculos-competencia';
import { RegistroRecalculadores } from '../faturamento/application/recalculadores';
import { RecalcularCompetenciaFechada } from '../faturamento/application/use-cases/recalcular-competencia';
import { FaturamentoModule } from '../faturamento/faturamento.module';
import { LerPacientesDosLaudos } from '../ingestao/application/use-cases/ler-pacientes-dos-laudos';
import { IngestaoModule } from '../ingestao/ingestao.module';
import {
  ADICIONAIS_REPOSITORY,
  type AdicionaisRepository,
} from './application/ports/adicionais.repository';
import { AGENDADOR_REPASSE, type AgendadorRepasse } from './application/ports/agendador-repasse';
import {
  CONFIGURACAO_REPASSE,
  type ConfiguracaoRepasseRepository,
} from './application/ports/configuracao-repasse.repository';
import { CONSULTAS_REPASSE, type ConsultasRepasse } from './application/ports/consultas-repasse';
import { DADOS_REPASSE, type DadosRepasse } from './application/ports/dados-repasse';
import { GERACOES_REPASSE, type GeracoesRepasse } from './application/ports/geracoes-repasse';
import {
  PRECOS_REPASSE_REPOSITORY,
  type PrecosRepasseRepository,
} from './application/ports/precos-repasse.repository';
import { RECALCULO_REPASSE, type RecalculoRepasse } from './application/ports/recalculo-repasse';
import {
  REGRAS_MEDICO_REPOSITORY,
  type RegrasMedicoRepository,
} from './application/ports/regras-medico.repository';
import {
  VERSOES_CONFIGURACAO,
  type VersoesConfiguracaoRepository,
} from './application/ports/versoes-configuracao.repository';
import { TAREFA_GERAR_PREVIAS, TAREFA_GERAR_REPASSE } from './application/tarefas';
import {
  CancelarAdicional,
  LancarAdicional,
  ListarAdicionais,
  ListarAdicionaisDoMedico,
} from './application/use-cases/adicionais';
import {
  CriarAlternativaPreco,
  CriarReclassificacao,
  CriarVersaoParametros,
  EncerrarConfiguracao,
  ListarParametros,
  ListarRegrasDoRepasse,
} from './application/use-cases/configuracao';
import {
  AlterarAlternativaPreco,
  AlterarReclassificacao,
  CancelarVersaoConfiguracao,
  ListarParametrosComAutoria,
  ListarRegrasComNomes,
} from './application/use-cases/configuracao-versoes';
import {
  ListarDemonstrativos,
  ListarLaudosDoDemonstrativo,
  ObterCompetenciaRepasse,
  ObterDemonstrativo,
  TarifasDoLancamento,
} from './application/use-cases/consultas';
import { GerarRepasse } from './application/use-cases/gerar-repasse';
import {
  ExportarPrecosMedico,
  HistoricoPrecoMedico,
  ListarPrecosMedico,
  MudarPrecosMedico,
  OpcoesPrecosRepasse,
} from './application/use-cases/precos-medico';
import { RecalcularRepasse } from './application/use-cases/recalcular-repasse';
import {
  AlterarRegraApuracao,
  CancelarRegraApuracao,
  CancelarVersaoContagem,
  CriarRegraApuracao,
  EncerrarRegraApuracao,
  ListarContagemMedico,
  ListarRegrasApuracao,
  NovaVersaoContagem,
} from './application/use-cases/regras-medico';
import { ConfiguracaoVersoesController } from './infrastructure/http/configuracao-versoes.controller';
import { PrecosRepasseController } from './infrastructure/http/precos-repasse.controller';
import { RegrasMedicoController } from './infrastructure/http/regras-medico.controller';
import { RepasseController } from './infrastructure/http/repasse.controller';
import { RepasseConsultasController } from './infrastructure/http/repasse-consultas.controller';
import { AgendadorRepasseFila } from './infrastructure/jobs/agendador-repasse-fila';
import { enfileirarRepasse } from './infrastructure/jobs/enfileirar-repasse';
import { AvisosDaGeracao } from './infrastructure/persistence/avisos-da-geracao';
import { DrizzleAdicionaisRepository } from './infrastructure/persistence/drizzle-adicionais.repository';
import { DrizzleConfiguracaoRepasseRepository } from './infrastructure/persistence/drizzle-configuracao-repasse.repository';
import { DrizzleConsultasRepasse } from './infrastructure/persistence/drizzle-consultas-repasse';
import { DrizzleDadosRepasse } from './infrastructure/persistence/drizzle-dados-repasse';
import {
  AO_GRAVAR_GERACAO,
  type AoGravarGeracao,
  DrizzleGeracoesRepasse,
} from './infrastructure/persistence/drizzle-geracoes-repasse';
import { DrizzlePrecosRepasseRepository } from './infrastructure/persistence/drizzle-precos-repasse.repository';
import { DrizzleRegrasMedicoRepository } from './infrastructure/persistence/drizzle-regras-medico.repository';
import { DrizzleVersoesConfiguracaoRepository } from './infrastructure/persistence/drizzle-versoes-configuracao.repository';
import { RecalculoRepasseAdapter } from './infrastructure/recalculo-repasse.adapter';

const agora = () => new Date();

const CONFIGURACAO = [
  CriarVersaoParametros,
  CriarReclassificacao,
  CriarAlternativaPreco,
  EncerrarConfiguracao,
] as const;

/**
 * Contexto `repasse` (hexagonal): o que se paga a cada médico na competência. A competência e o
 * recálculo da fechada (com motivo) são os do `faturamento` (fechamento único).
 */
@Module({
  imports: [FaturamentoModule, IngestaoModule],
  controllers: [
    RepasseController,
    RepasseConsultasController,
    PrecosRepasseController,
    RegrasMedicoController,
    ConfiguracaoVersoesController,
  ],
  providers: [
    { provide: CONSULTAS_REPASSE, useClass: DrizzleConsultasRepasse },
    ...[ObterCompetenciaRepasse, ListarDemonstrativos, ObterDemonstrativo].map((Caso) => ({
      provide: Caso,
      inject: [CONSULTAS_REPASSE],
      useFactory: (c: ConsultasRepasse) => new Caso(c),
    })),
    {
      provide: ListarLaudosDoDemonstrativo,
      inject: [CONSULTAS_REPASSE, LerPacientesDosLaudos],
      useFactory: (c: ConsultasRepasse, pacientes: LerPacientesDosLaudos) =>
        new ListarLaudosDoDemonstrativo(c, pacientes),
    },
    {
      provide: TarifasDoLancamento,
      inject: [GERACOES_REPASSE, ADICIONAIS_REPOSITORY],
      useFactory: (g: GeracoesRepasse, repo: AdicionaisRepository) =>
        new TarifasDoLancamento(g, repo),
    },
    { provide: DADOS_REPASSE, useClass: DrizzleDadosRepasse },
    AvisosDaGeracao,
    {
      // Os avisos de laudo sem preço, na transação da geração.
      provide: AO_GRAVAR_GERACAO,
      inject: [AvisosDaGeracao],
      useFactory:
        (avisos: AvisosDaGeracao): AoGravarGeracao =>
        (tx, g) =>
          avisos.registrar(tx, g),
    },
    { provide: GERACOES_REPASSE, useClass: DrizzleGeracoesRepasse },
    { provide: ADICIONAIS_REPOSITORY, useClass: DrizzleAdicionaisRepository },
    { provide: CONFIGURACAO_REPASSE, useClass: DrizzleConfiguracaoRepasseRepository },
    { provide: PRECOS_REPASSE_REPOSITORY, useClass: DrizzlePrecosRepasseRepository },
    ...[ListarPrecosMedico, HistoricoPrecoMedico, MudarPrecosMedico, ExportarPrecosMedico].map(
      (Caso) => ({
        provide: Caso,
        inject: [PRECOS_REPASSE_REPOSITORY],
        useFactory: (repo: PrecosRepasseRepository) => new Caso(repo, agora),
      }),
    ),
    { provide: REGRAS_MEDICO_REPOSITORY, useClass: DrizzleRegrasMedicoRepository },
    { provide: VERSOES_CONFIGURACAO, useClass: DrizzleVersoesConfiguracaoRepository },
    ...[
      ListarRegrasComNomes,
      ListarParametrosComAutoria,
      AlterarReclassificacao,
      AlterarAlternativaPreco,
      CancelarVersaoConfiguracao,
    ].map((Caso) => ({
      provide: Caso,
      inject: [CONFIGURACAO_REPASSE, VERSOES_CONFIGURACAO, AUDITORIA, AGENDADOR_REPASSE],
      useFactory: (
        repo: ConfiguracaoRepasseRepository,
        versoes: VersoesConfiguracaoRepository,
        auditoria: Auditoria,
        a: AgendadorRepasse,
      ) => new Caso(repo, versoes, auditoria, a, agora),
    })),
    ...[
      ListarContagemMedico,
      NovaVersaoContagem,
      CancelarVersaoContagem,
      ListarRegrasApuracao,
      CriarRegraApuracao,
      AlterarRegraApuracao,
      EncerrarRegraApuracao,
      CancelarRegraApuracao,
    ].map((Caso) => ({
      provide: Caso,
      inject: [REGRAS_MEDICO_REPOSITORY],
      useFactory: (repo: RegrasMedicoRepository) => new Caso(repo, agora),
    })),
    {
      provide: ListarAdicionaisDoMedico,
      inject: [ADICIONAIS_REPOSITORY],
      useFactory: (repo: AdicionaisRepository) => new ListarAdicionaisDoMedico(repo),
    },
    {
      provide: OpcoesPrecosRepasse,
      inject: [PRECOS_REPASSE_REPOSITORY],
      useFactory: (repo: PrecosRepasseRepository) => new OpcoesPrecosRepasse(repo),
    },
    { provide: AGENDADOR_REPASSE, useClass: AgendadorRepasseFila },
    {
      provide: RECALCULO_REPASSE,
      inject: [RecalcularCompetenciaFechada, RECALCULOS_COMPETENCIA],
      useFactory: (recalcular: RecalcularCompetenciaFechada, recalculos: RecalculosCompetencia) =>
        new RecalculoRepasseAdapter(recalcular, recalculos),
    },
    {
      provide: RecalcularRepasse,
      inject: [RECALCULO_REPASSE],
      useFactory: (r: RecalculoRepasse) => new RecalcularRepasse(r),
    },
    {
      provide: GerarRepasse,
      inject: [DADOS_REPASSE, GERACOES_REPASSE, RECALCULO_REPASSE],
      useFactory: (d: DadosRepasse, g: GeracoesRepasse, r: RecalculoRepasse) =>
        new GerarRepasse(d, g, r, agora),
    },
    {
      provide: LancarAdicional,
      inject: [ADICIONAIS_REPOSITORY, GERACOES_REPASSE, RECALCULO_REPASSE, AGENDADOR_REPASSE],
      useFactory: (
        repo: AdicionaisRepository,
        g: GeracoesRepasse,
        r: RecalculoRepasse,
        a: AgendadorRepasse,
      ) => new LancarAdicional(repo, g, r, a, agora),
    },
    {
      provide: CancelarAdicional,
      inject: [ADICIONAIS_REPOSITORY, GERACOES_REPASSE, AGENDADOR_REPASSE],
      useFactory: (repo: AdicionaisRepository, g: GeracoesRepasse, a: AgendadorRepasse) =>
        new CancelarAdicional(repo, g, a, agora),
    },
    {
      provide: ListarAdicionais,
      inject: [ADICIONAIS_REPOSITORY],
      useFactory: (repo: AdicionaisRepository) => new ListarAdicionais(repo),
    },
    ...CONFIGURACAO.map((Caso) => ({
      provide: Caso,
      inject: [CONFIGURACAO_REPASSE, AUDITORIA, AGENDADOR_REPASSE],
      useFactory: (
        repo: ConfiguracaoRepasseRepository,
        auditoria: Auditoria,
        a: AgendadorRepasse,
      ) => new Caso(repo, auditoria, a, agora),
    })),
    ...[ListarParametros, ListarRegrasDoRepasse].map((Caso) => ({
      provide: Caso,
      inject: [CONFIGURACAO_REPASSE],
      useFactory: (repo: ConfiguracaoRepasseRepository) => new Caso(repo),
    })),
  ],
})
export class RepasseModule implements OnModuleInit {
  constructor(
    private readonly tarefas: RegistroTarefas,
    private readonly recalculadores: RegistroRecalculadores,
    private readonly gerar: GerarRepasse,
    @Inject(GERACOES_REPASSE) private readonly geracoes: GeracoesRepasse,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  onModuleInit() {
    // O recálculo da competência fechada (pedido com motivo) roda o mesmo job, com o id do pedido.
    this.recalculadores.registrar({
      contexto: 'repasse',
      enfileirar: (executor, { recalculoId, competencia }) =>
        enfileirarRepasse(executor, competencia, recalculoId),
    });
    this.tarefas.registrar(TAREFA_GERAR_REPASSE, async (payload) => {
      const p = payload as { competencia?: unknown; recalculoId?: unknown } | null;
      if (typeof p?.competencia !== 'string')
        throw new Error(`${TAREFA_GERAR_REPASSE}: payload inválido`);
      await this.gerar.executar({
        competencia: p.competencia,
        recalculoId: typeof p.recalculoId === 'string' ? p.recalculoId : null,
      });
    });
    this.tarefas.registrar(TAREFA_GERAR_PREVIAS, async () => {
      for (const c of await this.geracoes.abertas()) await enfileirarRepasse(this.db, c);
    });
    // A cada 15 minutos (a importação da MobileMed roda nesse ritmo).
    this.tarefas.agendar(TAREFA_GERAR_PREVIAS, '*/15 * * * *');
  }
}
