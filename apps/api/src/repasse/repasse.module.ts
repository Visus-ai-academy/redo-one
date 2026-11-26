import { Inject, Module, type OnModuleInit } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../auditoria/auditoria';
import { RegistroTarefas } from '../comum/jobs/registro-tarefas';
import { DATABASE, type Database } from '../database/database';
import type { CompetenciasRepository } from '../faturamento/application/ports/competencias.repository';
import {
  RECALCULOS_COMPETENCIA,
  type RecalculosCompetencia,
} from '../faturamento/application/ports/recalculos-competencia';
import { RegistroRecalculadores } from '../faturamento/application/recalculadores';
import { RecalcularCompetenciaFechada } from '../faturamento/application/use-cases/recalcular-competencia';
import { FaturamentoModule } from '../faturamento/faturamento.module';
import { COMPETENCIAS_BLOQUEADAS } from '../ingestao/application/ports/competencias-bloqueadas';
import {
  ADICIONAIS_REPOSITORY,
  type AdicionaisRepository,
} from './application/ports/adicionais.repository';
import { AGENDADOR_REPASSE, type AgendadorRepasse } from './application/ports/agendador-repasse';
import {
  CONFIGURACAO_REPASSE,
  type ConfiguracaoRepasseRepository,
} from './application/ports/configuracao-repasse.repository';
import { DADOS_REPASSE, type DadosRepasse } from './application/ports/dados-repasse';
import { GERACOES_REPASSE, type GeracoesRepasse } from './application/ports/geracoes-repasse';
import { RECALCULO_REPASSE, type RecalculoRepasse } from './application/ports/recalculo-repasse';
import { TAREFA_GERAR_PREVIAS, TAREFA_GERAR_REPASSE } from './application/tarefas';
import {
  CancelarAdicional,
  LancarAdicional,
  ListarAdicionais,
} from './application/use-cases/adicionais';
import {
  CriarAlternativaPreco,
  CriarReclassificacao,
  CriarVersaoParametros,
  EncerrarConfiguracao,
  ListarParametros,
  ListarRegrasDoRepasse,
} from './application/use-cases/configuracao';
import { GerarRepasse } from './application/use-cases/gerar-repasse';
import { RecalcularRepasse } from './application/use-cases/recalcular-repasse';
import { RepasseController } from './infrastructure/http/repasse.controller';
import { AgendadorRepasseFila } from './infrastructure/jobs/agendador-repasse-fila';
import { enfileirarRepasse } from './infrastructure/jobs/enfileirar-repasse';
import { DrizzleAdicionaisRepository } from './infrastructure/persistence/drizzle-adicionais.repository';
import { DrizzleConfiguracaoRepasseRepository } from './infrastructure/persistence/drizzle-configuracao-repasse.repository';
import { DrizzleDadosRepasse } from './infrastructure/persistence/drizzle-dados-repasse';
import {
  AO_GRAVAR_GERACAO,
  type AoGravarGeracao,
  DrizzleGeracoesRepasse,
} from './infrastructure/persistence/drizzle-geracoes-repasse';
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
  imports: [FaturamentoModule],
  controllers: [RepasseController],
  providers: [
    { provide: DADOS_REPASSE, useClass: DrizzleDadosRepasse },
    // O registro dos avisos entra no passo dos avisos; por ora nada depois de gravar.
    { provide: AO_GRAVAR_GERACAO, useValue: (async () => undefined) satisfies AoGravarGeracao },
    { provide: GERACOES_REPASSE, useClass: DrizzleGeracoesRepasse },
    { provide: ADICIONAIS_REPOSITORY, useClass: DrizzleAdicionaisRepository },
    { provide: CONFIGURACAO_REPASSE, useClass: DrizzleConfiguracaoRepasseRepository },
    { provide: AGENDADOR_REPASSE, useClass: AgendadorRepasseFila },
    {
      // O `faturamento` exporta as competências pela porta da ingestão (o mesmo repositório).
      provide: RecalcularCompetenciaFechada,
      inject: [COMPETENCIAS_BLOQUEADAS, RECALCULOS_COMPETENCIA, RegistroRecalculadores, AUDITORIA],
      useFactory: (
        competencias: CompetenciasRepository,
        recalculos: RecalculosCompetencia,
        registro: RegistroRecalculadores,
        auditoria: Auditoria,
      ) => new RecalcularCompetenciaFechada(competencias, recalculos, registro, auditoria, agora),
    },
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
    // O registro do `faturamento` é um objeto só no processo (useValue): outra instância da
    // aplicação no mesmo processo (testes, export do OpenAPI) já o encontra registrado.
    if (!this.recalculadores.obter('repasse'))
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
