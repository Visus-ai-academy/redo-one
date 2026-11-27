import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { aparar, PaginacaoDto } from '../../../../catalogo/comum/dto';
import { SITUACOES_FILTRO_TITULO } from '../../../application/ports/titulos.repository';
import {
  FORMAS_BAIXA,
  type FormaBaixa,
  ORIGENS_TITULO,
  type OrigemTitulo,
  SITUACOES_TITULO,
  type SituacaoTitulo,
  TIPOS_FAVORECIDO,
  TIPOS_TITULO,
  type TipoFavorecido,
  type TipoTitulo,
} from '../../../domain/titulo';

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const dia = (descricao: string) => ({ type: String, format: 'date', description: descricao });
const texto = (max: number, exemplo?: string) => ({
  type: String,
  nullable: true,
  maxLength: max,
  example: exemplo,
});
const TODAS = 'todas';

const TIPO_FAVORECIDO = { enum: TIPOS_FAVORECIDO, enumName: 'TipoFavorecido' };
const ORIGEM = { enum: ORIGENS_TITULO, enumName: 'OrigemTitulo' };
const FORMA = { enum: FORMAS_BAIXA, enumName: 'FormaBaixa' };

export class ListarTitulosDto extends PaginacaoDto {
  @ApiPropertyOptional({ description: 'Nome do favorecido, nº (R-0123), documento ou descrição.' })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;

  @ApiProperty({ description: 'Id da empresa ou `todas` (escolha explícita).', example: TODAS })
  @ValidateIf((o: ListarTitulosDto) => o.empresa !== TODAS)
  @IsUUID()
  empresa!: string;

  @ApiProperty({
    enum: SITUACOES_FILTRO_TITULO,
    enumName: 'SituacaoFiltroTitulo',
    description:
      '`em_aberto` = aberto ou parcial; `vencidos` = em aberto com vencimento antes de hoje.',
  })
  @IsIn(SITUACOES_FILTRO_TITULO)
  situacao!: (typeof SITUACOES_FILTRO_TITULO)[number];

  @ApiProperty({
    enum: [TODAS, ...ORIGENS_TITULO],
    enumName: 'OrigemFiltroTitulo',
  })
  @IsIn([TODAS, ...ORIGENS_TITULO])
  origem!: typeof TODAS | OrigemTitulo;

  @ApiProperty({ description: 'Id da categoria ou `todas`.', example: TODAS })
  @ValidateIf((o: ListarTitulosDto) => o.categoria !== TODAS)
  @IsUUID()
  categoria!: string;

  @ApiPropertyOptional({
    ...TIPO_FAVORECIDO,
    description: 'Com `favorecidoId`: só os títulos dele.',
  })
  @IsOptional()
  @IsIn(TIPOS_FAVORECIDO)
  favorecidoTipo?: TipoFavorecido;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((o: ListarTitulosDto) => o.favorecidoTipo !== undefined)
  @IsUUID()
  favorecidoId?: string;

  @ApiPropertyOptional(dia('Vencimento a partir deste dia.'))
  @IsOptional()
  @Matches(DIA)
  vencimentoDe?: string;

  @ApiPropertyOptional(dia('Vencimento até este dia.'))
  @IsOptional()
  @Matches(DIA)
  vencimentoAte?: string;
}

export class FavorecidoDto {
  @ApiProperty(TIPO_FAVORECIDO)
  @IsIn(TIPOS_FAVORECIDO)
  tipo!: TipoFavorecido;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;
}

/** Corpo de lançar e editar título. */
export class TituloDto {
  @ApiProperty({ format: 'uuid', description: 'A empresa (contratado que usa o financeiro).' })
  @IsUUID()
  contratadoId!: string;

  @ApiProperty({
    type: FavorecidoDto,
    description: 'Cliente (a receber), fornecedor ou médico (a pagar).',
  })
  @ValidateNested()
  @Type(() => FavorecidoDto)
  favorecido!: FavorecidoDto;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoriaId!: string;

  @ApiProperty({ example: 'Honorários de dezembro', maxLength: 200 })
  @IsString()
  @MaxLength(300)
  descricao!: string;

  @ApiPropertyOptional(texto(60, 'NFS-e 1.284'))
  @IsOptional()
  @IsString()
  @MaxLength(60)
  documento: string | null = null;

  @ApiPropertyOptional({ ...texto(7, '2026-11'), description: 'AAAA-MM.' })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  competencia: string | null = null;

  @ApiProperty(dia('Emissão.'))
  @IsString()
  emissaoEm!: string;

  @ApiProperty(dia('Vencimento.'))
  @IsString()
  vencimento!: string;

  @ApiProperty({ type: 'integer', description: 'Em centavos, maior que zero.' })
  @IsInt()
  valorCentavos!: number;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  contaPrevistaId: string | null = null;

  @ApiPropertyOptional(texto(2000))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes: string | null = null;
}

export class FavorecidoNomeDto extends FavorecidoDto {
  @ApiProperty() nome!: string;
}

export class TituloItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: TIPOS_TITULO, enumName: 'TipoTitulo' }) tipo!: TipoTitulo;
  @ApiProperty({ type: 'integer', description: 'Mostrado como R-0123 ou P-0045.' })
  numero!: number;
  @ApiProperty({ format: 'uuid' }) contratadoId!: string;
  @ApiProperty() empresaNome!: string;
  @ApiProperty({ type: FavorecidoNomeDto }) favorecido!: FavorecidoNomeDto;
  @ApiProperty({ format: 'uuid' }) categoriaId!: string;
  @ApiProperty({ description: '"Grupo › Categoria" ou só a categoria.' }) categoriaNome!: string;
  @ApiProperty() descricao!: string;
  @ApiProperty({ type: String, nullable: true }) documento!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'AAAA-MM.' }) competencia!:
    | string
    | null;
  @ApiProperty({ format: 'date' }) emissaoEm!: string;
  @ApiProperty({ format: 'date' }) vencimento!: string;
  @ApiProperty({ type: 'integer' }) valorCentavos!: number;
  @ApiProperty({ type: 'integer', description: 'Soma do principal das baixas não estornadas.' })
  pagoCentavos!: number;
  @ApiProperty({ enum: SITUACOES_TITULO, enumName: 'SituacaoTitulo' }) situacao!: SituacaoTitulo;
  @ApiProperty(ORIGEM) origem!: OrigemTitulo;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) contaPrevistaId!: string | null;
  @ApiProperty({
    type: 'integer',
    description: 'Dias desde o vencimento, hoje em Brasília; 0 sem atraso ou sem saldo.',
  })
  diasDeAtraso!: number;
}

export class TotaisTitulosDto {
  @ApiProperty({ type: 'integer', description: 'Saldo de aberto e parcial.' })
  abertoCentavos!: number;
  @ApiProperty({ type: 'integer', description: 'Parte do saldo vencida antes de hoje.' })
  vencidoCentavos!: number;
}

export class PaginaTitulosDto {
  @ApiProperty({ type: [TituloItemDto] }) itens!: TituloItemDto[];
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) pagina!: number;
  @ApiProperty({ type: 'integer' }) porPagina!: number;
  @ApiProperty({ type: TotaisTitulosDto }) totais!: TotaisTitulosDto;
}

export class BaixaDoTituloDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date' }) pagoEm!: string;
  @ApiProperty({ format: 'uuid' }) contaBancariaId!: string;
  @ApiProperty() contaNome!: string;
  @ApiProperty({ type: 'integer' }) principalCentavos!: number;
  @ApiProperty({ type: 'integer' }) jurosCentavos!: number;
  @ApiProperty({ type: 'integer' }) multaCentavos!: number;
  @ApiProperty({ type: 'integer' }) descontoCentavos!: number;
  @ApiProperty({ type: 'integer' }) valorMovimentadoCentavos!: number;
  @ApiProperty(FORMA) forma!: FormaBaixa;
  @ApiProperty({ type: String, nullable: true }) observacao!: string | null;
  @ApiProperty({ type: String, nullable: true }) criadoPorNome!: string | null;
  @ApiProperty() criadoEm!: Date;
  @ApiProperty({ type: Date, nullable: true }) estornadaEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) estornadaPorNome!: string | null;
  @ApiProperty({ type: String, nullable: true }) motivoEstorno!: string | null;
}

export class TituloDetalheDto extends TituloItemDto {
  @ApiProperty({ type: String, nullable: true }) contaPrevistaNome!: string | null;
  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description: 'Antes da prorrogação.',
  })
  vencimentoOriginal!: string | null;
  @ApiProperty({ type: String, nullable: true }) observacoes!: string | null;
  @ApiProperty({ type: Date, nullable: true }) canceladoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) motivoCancelamento!: string | null;
  @ApiProperty() criadoEm!: Date;
  @ApiProperty({ type: [BaixaDoTituloDto], description: 'Da mais nova para a mais antiga.' })
  baixas!: BaixaDoTituloDto[];
}

/** Corpo de dar baixa. */
export class BaixaDto {
  @ApiProperty(dia('Data do pagamento; não pode ser depois de hoje.'))
  @IsString()
  pagoEm!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  contaBancariaId!: string;

  @ApiProperty({ type: 'integer', description: 'Quanto abate do saldo, em centavos.' })
  @IsInt()
  principalCentavos!: number;

  @ApiPropertyOptional({ type: 'integer', default: 0 })
  @IsOptional()
  @IsInt()
  jurosCentavos: number = 0;

  @ApiPropertyOptional({ type: 'integer', default: 0 })
  @IsOptional()
  @IsInt()
  multaCentavos: number = 0;

  @ApiPropertyOptional({ type: 'integer', default: 0 })
  @IsOptional()
  @IsInt()
  descontoCentavos: number = 0;

  @ApiProperty(FORMA)
  @IsIn(FORMAS_BAIXA)
  forma!: FormaBaixa;

  @ApiPropertyOptional(texto(500))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao: string | null = null;
}

export class MotivoDto {
  @ApiProperty({ maxLength: 1000, description: 'Fica no histórico.' })
  @IsString()
  @MaxLength(1000)
  motivo!: string;
}

export class ProrrogacaoDto extends MotivoDto {
  @ApiProperty(dia('O novo vencimento.'))
  @IsString()
  vencimento!: string;
}

export class ListarFavorecidosDto {
  @ApiPropertyOptional({ description: 'Parte do nome.' })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;
}

export class OpcaoFavorecidoDto extends FavorecidoNomeDto {
  @ApiProperty({ type: String, nullable: true, description: 'Nome fantasia, quando há.' })
  detalhe!: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Do fornecedor: a categoria sugerida ao lançar a despesa.',
  })
  categoriaPadraoId!: string | null;
}
