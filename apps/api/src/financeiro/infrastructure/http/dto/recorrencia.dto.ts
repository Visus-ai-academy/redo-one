import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { aparar, PaginacaoDto } from '../../../../catalogo/comum/dto';
import {
  AJUSTES_DIA_NAO_UTIL,
  type AjusteDiaNaoUtil,
  FREQUENCIAS,
  type Frequencia,
  MODOS_VALOR,
  type ModoValor,
  SITUACOES_RECORRENCIA,
  type SituacaoRecorrencia,
  TERMINOS,
  type Termino,
} from '../../../domain/recorrencia';
import { TIPOS_TITULO, type TipoTitulo } from '../../../domain/titulo';
import { AJUSTE } from './configuracao.dto';
import { FavorecidoDto, FavorecidoNomeDto } from './titulo.dto';

const TODAS = 'todas';
const FREQUENCIA = { enum: FREQUENCIAS, enumName: 'FrequenciaRecorrencia' };
const TERMINO = {
  enum: TERMINOS,
  enumName: 'TerminoRecorrencia',
  description: '`sem` término, até a `data` ou após N `ocorrencias`.',
};
const MODO = {
  enum: MODOS_VALOR,
  enumName: 'ModoValorRecorrencia',
  description: '`previsto`: muda todo mês; o título nasce com o previsto e o financeiro confere.',
};
const SITUACAO = { enum: SITUACOES_RECORRENCIA, enumName: 'SituacaoRecorrencia' };
const dia = (description: string) => ({ type: String, format: 'date', description });

export class ListarRecorrenciasDto extends PaginacaoDto {
  @ApiPropertyOptional({ description: 'Parte da descrição ou do nome do favorecido.' })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;

  @ApiProperty({ description: 'Id da empresa ou `todas` (escolha explícita).', example: TODAS })
  @ValidateIf((o: ListarRecorrenciasDto) => o.empresa !== TODAS)
  @IsUUID()
  empresa!: string;

  @ApiProperty({ enum: [TODAS, ...SITUACOES_RECORRENCIA], enumName: 'SituacaoFiltroRecorrencia' })
  @IsIn([TODAS, ...SITUACOES_RECORRENCIA])
  situacao!: typeof TODAS | SituacaoRecorrencia;

  @ApiProperty({ enum: [TODAS, ...FREQUENCIAS], enumName: 'FrequenciaFiltroRecorrencia' })
  @IsIn([TODAS, ...FREQUENCIAS])
  frequencia!: typeof TODAS | Frequencia;
}

/** A agenda da recorrência: o que a prévia precisa. */
export class AgendaRecorrenciaDto {
  @ApiProperty({ format: 'uuid', description: 'A empresa (contratado que usa o financeiro).' })
  @IsUUID()
  contratadoId!: string;

  @ApiProperty(FREQUENCIA)
  @IsIn(FREQUENCIAS)
  frequencia!: Frequencia;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    description: 'Dia do mês (1 a 31); vazio na semanal. Dia que não existe vira o último dia.',
  })
  @IsOptional()
  @IsInt()
  diaVencimento: number | null = null;

  @ApiProperty(dia('O vencimento da 1ª ocorrência.'))
  @IsString()
  primeiroVencimento!: string;

  @ApiPropertyOptional({ ...AJUSTE, nullable: true, description: 'Vazio = o padrão da empresa.' })
  @IsOptional()
  @IsIn(AJUSTES_DIA_NAO_UTIL)
  ajusteDiaNaoUtil: AjusteDiaNaoUtil | null = null;

  @ApiProperty(TERMINO)
  @IsIn(TERMINOS)
  termino!: Termino;

  @ApiPropertyOptional({ ...dia('Com término `data`.'), nullable: true })
  @IsOptional()
  @IsString()
  terminoEm: string | null = null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    description: 'Com término `ocorrencias`.',
  })
  @IsOptional()
  @IsInt()
  terminoOcorrencias: number | null = null;
}

/** Corpo de criar e editar a recorrência. */
export class RecorrenciaDto extends AgendaRecorrenciaDto {
  @ApiProperty({ type: FavorecidoDto })
  @ValidateNested()
  @Type(() => FavorecidoDto)
  favorecido!: FavorecidoDto;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoriaId!: string;

  @ApiProperty({ example: 'Aluguel da sala comercial', maxLength: 200 })
  @IsString()
  @MaxLength(300)
  descricao!: string;

  @ApiProperty({ type: 'integer', description: 'Em centavos, maior que zero.' })
  @IsInt()
  valorCentavos!: number;

  @ApiProperty(MODO)
  @IsIn(MODOS_VALOR)
  modoValor!: ModoValor;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  contaPrevistaId: string | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes: string | null = null;
}

export class EditarRecorrenciaDto extends RecorrenciaDto {
  @ApiProperty({
    description:
      'Também nos títulos já gerados em aberto, sem baixa e não editados à mão (senão, só nos próximos).',
  })
  @IsBoolean()
  aplicarAosGerados!: boolean;
}

export class RecorrenciaItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: TIPOS_TITULO, enumName: 'TipoTitulo' }) tipo!: TipoTitulo;
  @ApiProperty({ format: 'uuid' }) contratadoId!: string;
  @ApiProperty() empresaNome!: string;
  @ApiProperty({ type: FavorecidoNomeDto }) favorecido!: FavorecidoNomeDto;
  @ApiProperty() descricao!: string;
  @ApiProperty({ type: 'integer' }) valorCentavos!: number;
  @ApiProperty(MODO) modoValor!: ModoValor;
  @ApiProperty(FREQUENCIA) frequencia!: Frequencia;
  @ApiProperty({ type: 'integer', nullable: true }) diaVencimento!: number | null;
  @ApiProperty(TERMINO) termino!: Termino;
  @ApiProperty({ type: String, format: 'date', nullable: true }) terminoEm!: string | null;
  @ApiProperty({ type: 'integer', nullable: true }) terminoOcorrencias!: number | null;
  @ApiProperty(SITUACAO) situacao!: SituacaoRecorrencia;
  @ApiProperty({ type: Date, nullable: true }) encerradaEm!: Date | null;
  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description: 'O primeiro título gerado em aberto, de hoje em diante.',
  })
  proximoVencimento!: string | null;
}

export class PaginaRecorrenciasDto {
  @ApiProperty({ type: [RecorrenciaItemDto] }) itens!: RecorrenciaItemDto[];
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) pagina!: number;
  @ApiProperty({ type: 'integer' }) porPagina!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Quanto as ativas que o filtro pega pesam por mês (a semanal vale 52/12).',
  })
  previstoMensalCentavos!: number;
}

export class ProximoAGerarDto {
  @ApiProperty({ format: 'date' }) vencimento!: string;
  @ApiProperty({ format: 'date', description: 'Quando o job diário gera (o horizonte).' })
  geradoEm!: string;
}

export class RecorrenciaDetalheDto extends RecorrenciaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: TIPOS_TITULO, enumName: 'TipoTitulo' }) tipo!: TipoTitulo;
  @ApiProperty(SITUACAO) situacao!: SituacaoRecorrencia;
  @ApiProperty({ format: 'date' }) geraAPartirDe!: string;
  @ApiProperty() empresaNome!: string;
  @ApiProperty() favorecidoNome!: string;
  @ApiProperty() categoriaNome!: string;
  @ApiProperty({ type: String, nullable: true }) contaPrevistaNome!: string | null;
  @ApiProperty({ type: Date, nullable: true }) encerradaEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) motivoEncerramento!: string | null;
  @ApiProperty() criadoEm!: Date;
  @ApiProperty({ type: [Number], description: 'As ocorrências que já têm título.' })
  ocorrencias!: number[];
  @ApiProperty({ ...AJUSTE, description: 'O ajuste que vale (o dela ou o da empresa).' })
  ajusteEfetivo!: AjusteDiaNaoUtil;
  @ApiProperty({ type: 'integer' }) horizonteMeses!: number;
  @ApiProperty({ type: ProximoAGerarDto, nullable: true }) proximoAGerar!: ProximoAGerarDto | null;
}

export class RecorrenciaCriadaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: 'integer' }) titulosGerados!: number;
}

export class RecorrenciaEditadaDto {
  @ApiProperty({ type: 'integer' }) titulosAtualizados!: number;
}

export class RecorrenciaRetomadaDto {
  @ApiProperty({ type: 'integer' }) titulosGerados!: number;
}

export class TituloAjustavelDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: 'integer' }) numero!: number;
  @ApiProperty({ format: 'date' }) vencimento!: string;
}

export class PreviaRecorrenciaDto {
  @ApiProperty({ type: [String], description: 'Os vencimentos que sairiam agora, já ajustados.' })
  vencimentos!: string[];
  @ApiProperty({ type: 'integer' }) horizonteMeses!: number;
  @ApiProperty(AJUSTE) ajustePadrao!: AjusteDiaNaoUtil;
}
