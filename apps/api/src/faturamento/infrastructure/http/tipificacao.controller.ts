import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { IdCriadoDto } from '../../../catalogo/comum/dto';
import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type { DonoFatura } from '../../application/ports/tipificacao.repository';
import {
  BuscarMedicosTipificacao,
  ListarOpcoesTipificacao,
  ListarTipificacao,
  MudarFaturaTipificacao,
  ObterTipificacaoCliente,
  PreviaTipificacaoCliente,
  RemoverVersaoTipificacaoCliente,
  SalvarRegraTipificacao,
  SalvarSubregraTipificacao,
  SalvarTipificacaoCliente,
} from '../../application/use-cases/tipificacao';
import {
  BuscarMedicosQueryDto,
  type ConfiguracaoTipificacaoDto,
  CriarRegraTipificacaoDto,
  CriarSubregraTipificacaoDto,
  DadosRegraTipificacaoDto,
  DadosSubregraTipificacaoDto,
  LinhaPreviaTipificacaoDto,
  MudarFaturaTipificacaoDto,
  NomeDto,
  OpcoesTipificacaoDto,
  SalvarConfiguracaoTipificacaoDto,
  TipificacaoClienteDto,
  TipificacaoDto,
} from './dto/tipificacao.dto';

const regraDo = (d: DadosRegraTipificacaoDto) => ({
  nome: d.nome,
  descricao: d.descricao,
  cor: d.cor,
  ativo: d.ativo,
});
const subregraDo = (d: DadosSubregraTipificacaoDto) => ({
  regraId: d.regraId,
  nome: d.nome,
  descricao: d.descricao,
  ativo: d.ativo,
});
const configuracaoDo = (d: ConfiguracaoTipificacaoDto) => ({
  regraId: d.regraId,
  subregraDemaisId: d.subregraDemaisId,
  linhas: d.linhas.map((l) => ({
    tipo: l.tipo,
    valores: l.valores,
    modoMedico: l.modoMedico,
    medicos: l.medicos,
    equipes: l.equipes,
    subregraId: l.subregraId,
  })),
});

const TIPOS_FATURA = ['regras', 'subregras'] as const;
const donoDo = (tipo: (typeof TIPOS_FATURA)[number], id: string): DonoFatura => ({
  tipo: tipo === 'regras' ? 'regra' : 'subregra',
  id,
});
const INVALIDA = 'Nome vazio, cor fora de `#RRGGBB` ou regra da sub-regra inexistente.';
const MUDANCA = 'Salvo; a reclassificação das competências abertas vai para a fila.';
const VIGENCIA_INVALIDA =
  'Competência fechada, travada ou anterior a uma delas, ou nada mudou em relação ao que vale nela.';
const VERSAO_SO_PROGRAMADA = 'Só a versão programada que nunca valeu pode ser apagada.';
const CONFLITO_VERSAO = 'Outra pessoa mudou as versões ao mesmo tempo: recarregue.';

/** Configurações → Faturamento → Tipificação: regras (CO/NC/NC1) e sub-regras. */
@ApiTags('faturamento')
@Controller('faturamento/tipificacao')
export class TipificacaoController {
  constructor(
    private readonly listarCaso: ListarTipificacao,
    private readonly regraCaso: SalvarRegraTipificacao,
    private readonly subregraCaso: SalvarSubregraTipificacao,
    private readonly opcoesCaso: ListarOpcoesTipificacao,
    private readonly medicosCaso: BuscarMedicosTipificacao,
    private readonly faturaCaso: MudarFaturaTipificacao,
  ) {}

  @Get()
  @Permissao('faturamento.ver')
  @ApiOkResponse({ type: TipificacaoDto })
  listar(): Promise<TipificacaoDto> {
    return this.listarCaso.executar();
  }

  @Get('opcoes')
  @Permissao('faturamento.ver')
  @ApiOkResponse({
    type: OpcoesTipificacaoDto,
    description: 'Modalidades, especialidades, prioridades e equipes ativas, para o editor.',
  })
  opcoes(): Promise<OpcoesTipificacaoDto> {
    return this.opcoesCaso.executar();
  }

  @Get('medicos')
  @Permissao('faturamento.tipificacao.editar')
  @ApiOkResponse({ type: [NomeDto], description: 'Até 20 médicos ativos pelo nome.' })
  medicos(@Query() query: BuscarMedicosQueryDto): Promise<NomeDto[]> {
    return this.medicosCaso.executar(query.busca ?? '');
  }

  @Post('regras')
  @Permissao('faturamento.tipificacao.editar')
  @ApiCreatedResponse({ type: IdCriadoDto, description: MUDANCA })
  @ApiBadRequestResponse({ description: INVALIDA })
  @ApiConflictResponse({ description: 'Nome em uso.' })
  async criarRegra(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: CriarRegraTipificacaoDto,
  ): Promise<IdCriadoDto> {
    return {
      id: await this.regraCaso.executar(
        ator.usuarioId,
        null,
        regraDo(corpo),
        corpo.faturaSemSubregra,
      ),
    };
  }

  @Put('regras/:id')
  @Permissao('faturamento.tipificacao.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: MUDANCA })
  @ApiBadRequestResponse({ description: INVALIDA })
  @ApiNotFoundResponse({ description: 'Regra não encontrada.' })
  @ApiConflictResponse({ description: 'Nome em uso.' })
  async alterarRegra(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: DadosRegraTipificacaoDto,
  ): Promise<void> {
    await this.regraCaso.executar(ator.usuarioId, id, regraDo(corpo));
  }

  @Post('subregras')
  @Permissao('faturamento.tipificacao.editar')
  @ApiCreatedResponse({ type: IdCriadoDto, description: MUDANCA })
  @ApiBadRequestResponse({ description: INVALIDA })
  @ApiConflictResponse({ description: 'Nome em uso.' })
  async criarSubregra(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: CriarSubregraTipificacaoDto,
  ): Promise<IdCriadoDto> {
    return {
      id: await this.subregraCaso.executar(ator.usuarioId, null, subregraDo(corpo), corpo.fatura),
    };
  }

  @Put('subregras/:id')
  @Permissao('faturamento.tipificacao.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: MUDANCA })
  @ApiBadRequestResponse({ description: INVALIDA })
  @ApiNotFoundResponse({ description: 'Sub-regra não encontrada.' })
  @ApiConflictResponse({ description: 'Nome em uso.' })
  async alterarSubregra(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: DadosSubregraTipificacaoDto,
  ): Promise<void> {
    await this.subregraCaso.executar(ator.usuarioId, id, subregraDo(corpo));
  }

  @Post(':tipo/:id/fatura')
  @Permissao('faturamento.tipificacao.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'tipo', enum: TIPOS_FATURA })
  @ApiNoContentResponse({
    description: `Nova versão do "fatura" (sub-regra) ou do "fatura sem sub-regra" (regra); a anterior é encerrada na competência anterior. ${MUDANCA}`,
  })
  @ApiBadRequestResponse({ description: VIGENCIA_INVALIDA })
  @ApiNotFoundResponse({ description: 'Regra ou sub-regra não encontrada.' })
  @ApiConflictResponse({ description: CONFLITO_VERSAO })
  async mudarFatura(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('tipo', new ParseEnumPipe(TIPOS_FATURA)) tipo: (typeof TIPOS_FATURA)[number],
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: MudarFaturaTipificacaoDto,
  ): Promise<void> {
    await this.faturaCaso.mudar(ator.usuarioId, donoDo(tipo, id), corpo.fatura, corpo.aPartirDe);
  }

  @Delete(':tipo/:id/fatura/:versaoId')
  @Permissao('faturamento.tipificacao.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'tipo', enum: TIPOS_FATURA })
  @ApiNoContentResponse({
    description: `Versão programada apagada; a anterior volta a valer até onde ela ia. ${MUDANCA}`,
  })
  @ApiBadRequestResponse({ description: VERSAO_SO_PROGRAMADA })
  @ApiNotFoundResponse({ description: 'Regra, sub-regra ou versão não encontrada.' })
  @ApiConflictResponse({ description: CONFLITO_VERSAO })
  async removerFatura(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('tipo', new ParseEnumPipe(TIPOS_FATURA)) tipo: (typeof TIPOS_FATURA)[number],
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versaoId', ParseUUIDPipe) versaoId: string,
  ): Promise<void> {
    await this.faturaCaso.remover(ator.usuarioId, donoDo(tipo, id), versaoId);
  }
}

const CONFIGURACAO_INVALIDA =
  'Linha sem valores, "apenas"/"exceto" sem médico nem equipe, ou regra/sub-regra inexistente.';

/** Aba Faturamento do cliente → Tipificação: a configuração do cliente ou da unidade. */
@ApiTags('faturamento')
@Controller('faturamento/clientes/:clienteId/tipificacao')
export class TipificacaoClienteController {
  constructor(
    private readonly obterCaso: ObterTipificacaoCliente,
    private readonly salvarCaso: SalvarTipificacaoCliente,
    private readonly previaCaso: PreviaTipificacaoCliente,
    private readonly removerCaso: RemoverVersaoTipificacaoCliente,
  ) {}

  @Get()
  @Permissao('faturamento.ver')
  @ApiOkResponse({ type: TipificacaoClienteDto })
  @ApiNotFoundResponse({ description: 'Cliente não encontrado.' })
  async obter(
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
  ): Promise<TipificacaoClienteDto> {
    const { versoes, ...r } = await this.obterCaso.executar(clienteId);
    return { ...r, versoes: versoes.map(({ valor, ...v }) => ({ ...v, configuracao: valor })) };
  }

  @Put()
  @Permissao('faturamento.tipificacao.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: `Nova versão a partir de \`aPartirDe\`; a anterior é encerrada na competência anterior. Vazia (sem regra, linhas nem "todos os demais") volta a herdar. ${MUDANCA}`,
  })
  @ApiBadRequestResponse({ description: `${CONFIGURACAO_INVALIDA} ${VIGENCIA_INVALIDA}` })
  @ApiNotFoundResponse({ description: 'Cliente não encontrado.' })
  @ApiConflictResponse({ description: CONFLITO_VERSAO })
  salvar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Body() corpo: SalvarConfiguracaoTipificacaoDto,
  ): Promise<void> {
    return this.salvarCaso.executar(
      ator.usuarioId,
      clienteId,
      configuracaoDo(corpo),
      corpo.aPartirDe,
    );
  }

  @Delete('versoes/:versaoId')
  @Permissao('faturamento.tipificacao.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: `Versão programada apagada; a anterior volta a valer até onde ela ia. ${MUDANCA}`,
  })
  @ApiBadRequestResponse({ description: VERSAO_SO_PROGRAMADA })
  @ApiNotFoundResponse({ description: 'Cliente ou versão não encontrada.' })
  @ApiConflictResponse({ description: CONFLITO_VERSAO })
  removerVersao(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Param('versaoId', ParseUUIDPipe) versaoId: string,
  ): Promise<void> {
    return this.removerCaso.executar(ator.usuarioId, clienteId, versaoId);
  }

  @Post('previa')
  @Permissao('faturamento.tipificacao.editar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: [LinhaPreviaTipificacaoDto],
    description:
      'Laudos e volume das competências abertas em cada resultado, com as versões gravadas e com a nova (a partir de `aPartirDe`), sem gravar.',
  })
  @ApiBadRequestResponse({ description: `${CONFIGURACAO_INVALIDA} ${VIGENCIA_INVALIDA}` })
  @ApiNotFoundResponse({ description: 'Cliente não encontrado.' })
  previa(
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Body() corpo: SalvarConfiguracaoTipificacaoDto,
  ): Promise<LinhaPreviaTipificacaoDto[]> {
    return this.previaCaso.executar(clienteId, configuracaoDo(corpo), corpo.aPartirDe);
  }
}
