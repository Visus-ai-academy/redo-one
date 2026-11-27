import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { PaginacaoDto } from '../../../catalogo/comum/dto';
import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import { type PrincipalUsuario, temPermissao } from '../../../identidade/principal';
import {
  CONSULTAS_REPASSE,
  type ConsultasRepasse,
} from '../../application/ports/consultas-repasse';
import {
  ListarDemonstrativos,
  ListarLaudosDoDemonstrativo,
  ObterCompetenciaRepasse,
  ObterDemonstrativo,
  TarifasDoLancamento,
} from '../../application/use-cases/consultas';
import {
  BuscarMedicosRepasseDto,
  CompetenciaComRepasseDto,
  CompetenciaRepasseDto,
  DemonstrativoDetalheDto,
  ListarDemonstrativosDto,
  MedicoOpcaoDto,
  PaginaDemonstrativosRepasseDto,
  PaginaLaudosDemonstrativoDto,
  TarifasLancamentoDto,
} from './dto/consultas-repasse.dto';
import {
  CompetenciaRepasseParamDto,
  CompetenciaRepasseQueryDto,
  IdParamDto,
} from './dto/repasse.dto';

/**
 * Permissão que libera o nome do paciente na aba Laudos do demonstrativo. Por ora é a do próprio
 * repasse (decisão do usuário: o nome aparece); se o paciente ganhar permissão própria, troque só
 * aqui. A leitura é sempre auditada (`LerPacientesDosLaudos`).
 */
export const PERMISSAO_PACIENTE_REPASSE = 'repasse.ver';

/** Leituras das telas do repasse: competência e versões, demonstrativos, laudos pagos e tarifas. */
@ApiTags('repasse')
@Controller('repasse')
export class RepasseConsultasController {
  constructor(
    @Inject(CONSULTAS_REPASSE) private readonly consultas: ConsultasRepasse,
    private readonly competenciaCaso: ObterCompetenciaRepasse,
    private readonly demonstrativosCaso: ListarDemonstrativos,
    private readonly demonstrativoCaso: ObterDemonstrativo,
    private readonly laudosCaso: ListarLaudosDoDemonstrativo,
    private readonly tarifasCaso: TarifasDoLancamento,
  ) {}

  @Get('competencias')
  @Permissao('repasse.ver')
  @ApiOkResponse({
    type: [CompetenciaComRepasseDto],
    description: 'Competências com repasse gerado, a mais recente primeiro.',
  })
  competencias(): Promise<CompetenciaComRepasseDto[]> {
    return this.consultas.competencias();
  }

  @Get('competencias/:competencia')
  @Permissao('repasse.ver')
  @ApiOkResponse({
    type: CompetenciaRepasseDto,
    description: 'Situação, versões guardadas (com o motivo do recálculo) e a atual.',
  })
  competencia(
    @Param() { competencia }: CompetenciaRepasseParamDto,
  ): Promise<CompetenciaRepasseDto> {
    return this.competenciaCaso.executar(competencia);
  }

  @Get('competencias/:competencia/demonstrativos')
  @Permissao('repasse.ver')
  @ApiOkResponse({ type: PaginaDemonstrativosRepasseDto })
  @ApiNotFoundResponse({ description: 'A versão não é desta competência.' })
  demonstrativos(
    @Param() { competencia }: CompetenciaRepasseParamDto,
    @Query() q: ListarDemonstrativosDto,
  ): Promise<PaginaDemonstrativosRepasseDto> {
    return this.demonstrativosCaso.executar(competencia, q);
  }

  @Get('demonstrativos/:id')
  @Permissao('repasse.ver')
  @ApiOkResponse({ type: DemonstrativoDetalheDto })
  @ApiNotFoundResponse()
  demonstrativo(@Param() { id }: IdParamDto): Promise<DemonstrativoDetalheDto> {
    return this.demonstrativoCaso.executar(id);
  }

  @Get('demonstrativos/:id/laudos')
  @Permissao('repasse.ver')
  @ApiOkResponse({
    type: PaginaLaudosDemonstrativoDto,
    description:
      'Laudos pagos, por data; o nome do paciente só com a permissão (leitura auditada).',
  })
  @ApiNotFoundResponse()
  laudos(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { id }: IdParamDto,
    @Query() { pagina, porPagina }: PaginacaoDto,
  ): Promise<PaginaLaudosDemonstrativoDto> {
    return this.laudosCaso.executar(
      {
        usuarioId: ator.usuarioId,
        podeVerPaciente: temPermissao(ator, PERMISSAO_PACIENTE_REPASSE),
      },
      id,
      pagina,
      porPagina,
    );
  }

  @Get('tarifas')
  @Permissao('repasse.ver')
  @ApiOkResponse({
    type: TarifasLancamentoDto,
    description:
      'Tarifa vigente para o lançamento e para onde ele vai se a competência estiver fechada.',
  })
  tarifas(@Query() { competencia }: CompetenciaRepasseQueryDto): Promise<TarifasLancamentoDto> {
    return this.tarifasCaso.executar(competencia);
  }

  @Get('medicos')
  @Permissao('repasse.ver')
  @ApiOkResponse({ type: [MedicoOpcaoDto], description: 'Até 20 médicos ativos.' })
  medicos(@Query() { busca }: BuscarMedicosRepasseDto): Promise<MedicoOpcaoDto[]> {
    return this.consultas.medicos(busca, 20);
  }
}
