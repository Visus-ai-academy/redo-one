import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { aparar, PaginacaoDto } from '../../../../catalogo/comum/dto';
import { AJUSTES_DIA_NAO_UTIL, type AjusteDiaNaoUtil } from '../../../domain/recorrencia';

export const AJUSTE = {
  enum: AJUSTES_DIA_NAO_UTIL,
  enumName: 'AjusteDiaNaoUtil',
  description: 'Vencimento em fim de semana ou feriado: antecipa, posterga ou mantém.',
};
const HORIZONTE = {
  type: 'integer',
  minimum: 1,
  maximum: 24,
  description: 'Quantos meses à frente as recorrências geram os títulos.',
} as const;

const FAIXAS = {
  type: 'integer',
  isArray: true,
  example: [1, 6, 16, 31],
  description:
    'Começo (em dias de atraso) de cada faixa da inadimplência: de 2 a 8, a primeira no dia 1.',
} as const;

export class ConfiguracaoEmpresaDto {
  @ApiProperty({ format: 'uuid' }) empresaId!: string;
  @ApiProperty() empresaNome!: string;
  @ApiProperty(FAIXAS) faixasInadimplencia!: number[];
  @ApiProperty(HORIZONTE) horizonteRecorrenciaMeses!: number;
  @ApiProperty(AJUSTE) ajusteDiaNaoUtil!: AjusteDiaNaoUtil;
  @ApiProperty({ description: 'A empresa ainda não gravou as suas: vale o padrão.' })
  padrao!: boolean;
}

/** Corpo de salvar as regras financeiras de uma empresa. */
export class ConfiguracaoDto {
  @ApiProperty(FAIXAS)
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  faixasInadimplencia!: number[];

  @ApiProperty(HORIZONTE)
  @IsInt()
  horizonteRecorrenciaMeses!: number;

  @ApiProperty(AJUSTE)
  @IsIn(AJUSTES_DIA_NAO_UTIL)
  ajusteDiaNaoUtil!: AjusteDiaNaoUtil;
}

export class ListarInadimplenciaDto extends PaginacaoDto {
  @ApiPropertyOptional({ description: 'Parte do nome do cliente.' })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;

  @ApiProperty({ description: 'Id da empresa ou `todas` (escolha explícita).', example: 'todas' })
  @ValidateIf((o: ListarInadimplenciaDto) => o.empresa !== 'todas')
  @IsUUID()
  empresa!: string;

  @ApiProperty({
    type: String,
    description: 'O começo (em dias) da faixa de atraso, ou `todas` (escolha explícita).',
    example: 'todas',
  })
  @Transform(({ value }) => (value === 'todas' ? value : Number(value)))
  @ValidateIf((o: ListarInadimplenciaDto) => o.faixa !== 'todas')
  @IsInt()
  faixa!: 'todas' | number;
}

export class FaixaDto {
  @ApiProperty({ type: 'integer', description: 'O dia em que a faixa começa.' }) inicio!: number;
  @ApiProperty({ example: '6–15 dias' }) rotulo!: string;
}

export class FaixaDaLinhaDto extends FaixaDto {
  @ApiProperty({ type: 'integer', description: 'Posição da faixa (0 = a primeira).' })
  indice!: number;
  @ApiProperty({ type: 'integer', description: 'Quantas faixas a empresa tem.' }) de!: number;
}

export class LinhaInadimplenciaDto {
  @ApiProperty({ format: 'uuid' }) clienteId!: string;
  @ApiProperty() clienteNome!: string;
  @ApiProperty({ format: 'uuid' }) contratadoId!: string;
  @ApiProperty() empresaNome!: string;
  @ApiProperty({ type: 'integer', description: 'Títulos vencidos.' }) titulos!: number;
  @ApiProperty({ format: 'date', description: 'Vencimento do mais antigo.' }) maisAntigo!: string;
  @ApiProperty({ type: 'integer', description: 'Dias de atraso do mais antigo.' })
  diasDeAtraso!: number;
  @ApiProperty({ type: FaixaDaLinhaDto }) faixa!: FaixaDaLinhaDto;
  @ApiProperty({ type: 'integer' }) totalVencidoCentavos!: number;
}

export class PaginaInadimplenciaDto {
  @ApiProperty({ type: [LinhaInadimplenciaDto] }) itens!: LinhaInadimplenciaDto[];
  @ApiProperty({ type: 'integer', description: 'Clientes.' }) total!: number;
  @ApiProperty({ type: 'integer' }) pagina!: number;
  @ApiProperty({ type: 'integer' }) porPagina!: number;
  @ApiProperty({ type: 'integer', description: 'Vencido de tudo que o filtro pega.' })
  totalVencidoCentavos!: number;
  @ApiProperty({ type: [FaixaDto], description: 'As faixas das empresas em vista (o filtro).' })
  faixas!: FaixaDto[];
}
