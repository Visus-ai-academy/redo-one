import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { IdCriadoDto } from '../../../catalogo/comum/dto';
import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import { type PrincipalUsuario, temPermissao } from '../../../identidade/principal';
import { ConsultarRetratoFila, PedirLeituraFila } from '../../application/use-cases/retrato-fila';
import {
  AjustarMedicosRodada,
  AjustarProposta,
  AprovarRodada,
  type AtorRodada,
  BuscarMedicosDaRodada,
  CancelarRodada,
  ConsultarResumo,
  ConsultarRodada,
  ConsultarSituacao,
  CriarRodada,
  EncerrarRodada,
  ExplicarDesignacao,
  ListarDesignacoes,
  PausarRodada,
  PreverRecolhimento,
  RelerRodada,
  RetomarRodada,
} from '../../application/use-cases/rodadas';
import type { RodadaDetalhe } from '../../application/use-cases/rodadas/consultas';
import {
  AjustePropostaDto,
  BuscaMedicosQueryDto,
  DesignacoesQueryDto,
  ExplicacaoDto,
  ExplicacaoQueryDto,
  HistoricoQueryDto,
  MedicoDaBuscaDto,
  MedicosRodadaDto,
  PaginaDesignacoesDto,
  PaginaRodadasDto,
  PropostaRodadaDto,
  RecolhimentoPrevistoDto,
  RecortesRodadaDto,
  ResumoRodadaDto,
  RetratoFilaDto,
  RodadaDto,
  RodadaVivaDto,
  SituacaoRodadaDto,
} from './dto/rodada.dto';

const atorDe = (p: PrincipalUsuario): AtorRodada => ({
  usuarioId: p.usuarioId,
  acessoTotal: p.acessoTotal,
});

const rodadaDto = (r: RodadaDetalhe): RodadaDto => ({
  id: r.id,
  status: r.status,
  expiraEm: r.expiraEm,
  erro: r.erro,
  progresso: r.progresso,
  contagens: r.contagens,
  solicitadaPor: r.solicitadaPor,
  aprovadaPor: r.aprovadaPor,
  aprovadaEm: r.aprovadaEm,
  criadoEm: r.criadoEm,
  lidaEm: r.lidaEm,
  avisos: r.avisos,
  lidos: r.lidos,
  recolhidos: r.recolhidos,
  urgentes: r.urgentes,
  recortes: r.recortes,
  eventos: r.eventos,
});

const ID = new ParseUUIDPipe();

/**
 * Operação › Distribuição: a rodada do robô (só manual por ora). A tela consulta a situação a cada
 * 3–5 s só com rodada ativa. Recorte da gestora de escala nos casos de uso.
 */
@ApiTags('distribuicao')
@Controller('distribuicao/rodadas')
export class RodadasController {
  constructor(
    private readonly criarRodada: CriarRodada,
    private readonly ajustar: AjustarProposta,
    private readonly aprovarRodada: AprovarRodada,
    private readonly pausarRodada: PausarRodada,
    private readonly retomarRodada: RetomarRodada,
    private readonly encerrarRodada: EncerrarRodada,
    private readonly cancelarRodada: CancelarRodada,
    private readonly relerRodada: RelerRodada,
    private readonly ajustarMedicos: AjustarMedicosRodada,
    private readonly consultarSituacao: ConsultarSituacao,
    private readonly consultar: ConsultarRodada,
    private readonly listarDesignacoes: ListarDesignacoes,
    private readonly consultarFila: ConsultarRetratoFila,
    private readonly pedirLeitura: PedirLeituraFila,
    private readonly consultarResumo: ConsultarResumo,
    private readonly explicar: ExplicarDesignacao,
    private readonly buscarMedicos: BuscarMedicosDaRodada,
    private readonly preverRecolhimento: PreverRecolhimento,
  ) {}

  @Get('viva')
  @Permissao('distribuicao.ver')
  @ApiOkResponse({ type: RodadaVivaDto })
  async viva(): Promise<RodadaVivaDto> {
    const r = await this.consultar.viva();
    return { rodada: r ? rodadaDto(r) : null };
  }

  @Get()
  @Permissao('distribuicao.ver')
  @ApiOkResponse({ type: PaginaRodadasDto, description: 'Histórico, da mais nova à mais antiga.' })
  async historico(@Query() q: HistoricoQueryDto): Promise<PaginaRodadasDto> {
    const { itens, total } = await this.consultar.historico({
      pagina: q.pagina,
      porPagina: q.porPagina,
      ...(q.status?.length ? { status: q.status } : {}),
      ...(q.solicitadaPorId ? { solicitadaPorId: q.solicitadaPorId } : {}),
      ...(q.desde ? { desde: new Date(q.desde) } : {}),
    });
    return { itens, total, pagina: q.pagina, porPagina: q.porPagina };
  }

  @Get('fila')
  @Permissao('distribuicao.ver')
  @ApiOkResponse({
    type: RetratoFilaDto,
    description:
      'O último retrato da fila (contagens e quem está em turno), lido por job; não lê a MobileMed.',
  })
  fila(): Promise<RetratoFilaDto> {
    return this.consultarFila.executar();
  }

  @Post('fila/leitura')
  @Permissao('distribuicao.rodada.iniciar')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ description: 'Leitura única enfileirada (não distribui nada).' })
  lerFila(): Promise<void> {
    return this.pedirLeitura.executar();
  }

  @Get('recolhimento')
  @Permissao('distribuicao.ver')
  @ApiOkResponse({
    type: RecolhimentoPrevistoDto,
    description:
      'Prévia do "Distribuir agora": quantos exames a rodada recolheria agora de médicos fora do turno ou ausentes.',
  })
  recolhimento(): Promise<RecolhimentoPrevistoDto> {
    return this.preverRecolhimento.executar();
  }

  @Get('medicos')
  @Permissao('distribuicao.ver')
  @ApiOkResponse({
    type: [MedicoDaBuscaDto],
    description: 'Até 20 médicos ativos com conta na MobileMed (mover, mandar na mão, incluir).',
  })
  async medicosDaBusca(@Query() q: BuscaMedicosQueryDto): Promise<MedicoDaBuscaDto[]> {
    const lista = await this.buscarMedicos.executar(q.busca ?? '');
    return lista.map((m) => ({ id: m.id, nome: m.nome, habilitadoRobo: m.habilitadoRobo }));
  }

  @Post()
  @Permissao('distribuicao.rodada.iniciar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'Robô desligado ou nenhum médico habilitado.' })
  @ApiConflictResponse({ description: 'Já existe uma rodada em andamento.' })
  @ApiForbiddenResponse({ description: 'Recorte fora do da gestora de escala.' })
  async criar(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Body() corpo: RecortesRodadaDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.criarRodada.executar(atorDe(principal), corpo) };
  }

  @Get(':id')
  @Permissao('distribuicao.ver')
  @ApiOkResponse({ type: RodadaDto })
  @ApiNotFoundResponse()
  async obter(@Param('id', ID) id: string): Promise<RodadaDto> {
    return rodadaDto(await this.consultar.porId(id));
  }

  @Get(':id/situacao')
  @Permissao('distribuicao.ver')
  @ApiOkResponse({ type: SituacaoRodadaDto, description: 'Leve: para o polling de 3–5 s.' })
  @ApiNotFoundResponse()
  situacao(@Param('id', ID) id: string): Promise<SituacaoRodadaDto> {
    return this.consultarSituacao.executar(id);
  }

  @Get(':id/designacoes')
  @Permissao('distribuicao.ver')
  @ApiOkResponse({ type: PaginaDesignacoesDto })
  @ApiNotFoundResponse()
  async designacoes(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('id', ID) id: string,
    @Query() q: DesignacoesQueryDto,
  ): Promise<PaginaDesignacoesDto> {
    const { itens, total } = await this.listarDesignacoes.executar(
      atorDe(principal),
      id,
      q,
      temPermissao(principal, 'distribuicao.paciente.ver'),
    );
    return { itens, total, pagina: q.pagina, porPagina: q.porPagina };
  }

  @Get(':id/proposta')
  @Permissao('distribuicao.ver')
  @ApiOkResponse({
    type: PropostaRodadaDto,
    description:
      'A proposta inteira (as previstas, com a frente de cada exame), para a conferência por frente e médico.',
  })
  @ApiNotFoundResponse()
  proposta(@Param('id', ID) id: string): Promise<PropostaRodadaDto> {
    return this.listarDesignacoes.proposta(id);
  }

  @Get(':id/resumo')
  @Permissao('distribuicao.ver')
  @ApiOkResponse({
    type: ResumoRodadaDto,
    description:
      'Por médico (teto, carga, propostos), motivos de quem ficou de fora, ajustes e funil.',
  })
  @ApiNotFoundResponse()
  resumo(@Param('id', ID) id: string): Promise<ResumoRodadaDto> {
    return this.consultarResumo.executar(id);
  }

  @Get(':id/designacoes/:designacaoId/explicacao')
  @Permissao('distribuicao.ver')
  @ApiOkResponse({
    type: ExplicacaoDto,
    description: 'Por que este médico não pegou este exame, lido do registro da rodada.',
  })
  @ApiNotFoundResponse()
  explicacao(
    @Param('id', ID) id: string,
    @Param('designacaoId', ID) designacaoId: string,
    @Query() q: ExplicacaoQueryDto,
  ): Promise<ExplicacaoDto> {
    return this.explicar.executar(id, designacaoId, q.medicoId);
  }

  @Patch(':id/proposta')
  @Permissao('distribuicao.rodada.ajustar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description:
      'Tira (e desfaz), move exames previstos, com ou sem o pacote, e manda na mão os de fora (antes de aprovar).',
  })
  @ApiBadRequestResponse()
  @ApiConflictResponse({ description: 'A rodada não aguarda aprovação.' })
  ajustarProposta(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('id', ID) id: string,
    @Body() corpo: AjustePropostaDto,
  ): Promise<void> {
    return this.ajustar.executar(atorDe(principal), id, corpo);
  }

  @Post(':id/aprovar')
  @Permissao('distribuicao.rodada.aprovar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Aprovada: a execução foi enfileirada.' })
  @ApiConflictResponse({ description: 'Proposta expirada ou rodada em outro estado.' })
  aprovar(@PrincipalAtual() principal: PrincipalUsuario, @Param('id', ID) id: string) {
    return this.aprovarRodada.executar(atorDe(principal), id);
  }

  @Post(':id/pausar')
  @Permissao('distribuicao.rodada.controlar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse()
  pausar(@PrincipalAtual() principal: PrincipalUsuario, @Param('id', ID) id: string) {
    return this.pausarRodada.executar(atorDe(principal), id);
  }

  @Post(':id/retomar')
  @Permissao('distribuicao.rodada.controlar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'As falhas retentáveis voltam à fila junto.' })
  @ApiConflictResponse()
  retomar(@PrincipalAtual() principal: PrincipalUsuario, @Param('id', ID) id: string) {
    return this.retomarRodada.executar(atorDe(principal), id);
  }

  @Post(':id/encerrar')
  @Permissao('distribuicao.rodada.controlar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'O feito conta; o que falta fica para a próxima.' })
  @ApiConflictResponse()
  encerrar(@PrincipalAtual() principal: PrincipalUsuario, @Param('id', ID) id: string) {
    return this.encerrarRodada.executar(atorDe(principal), id);
  }

  @Post(':id/cancelar')
  @Permissao('distribuicao.rodada.controlar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse()
  cancelar(@PrincipalAtual() principal: PrincipalUsuario, @Param('id', ID) id: string) {
    return this.cancelarRodada.executar(atorDe(principal), id);
  }

  @Post(':id/reler')
  @Permissao('distribuicao.rodada.controlar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Lê a fila de novo (só sem nada atribuído).' })
  @ApiConflictResponse()
  reler(@PrincipalAtual() principal: PrincipalUsuario, @Param('id', ID) id: string) {
    return this.relerRodada.executar(atorDe(principal), id);
  }

  @Put(':id/medicos')
  @Permissao('distribuicao.rodada.controlar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Antes da leitura só grava; com a proposta pronta, lê a fila de novo.',
  })
  @ApiBadRequestResponse()
  @ApiConflictResponse()
  medicos(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('id', ID) id: string,
    @Body() corpo: MedicosRodadaDto,
  ) {
    return this.ajustarMedicos.executar(atorDe(principal), id, corpo);
  }
}
