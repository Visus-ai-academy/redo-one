import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { aparar, PaginacaoDto } from '../../../../catalogo/comum/dto';
import { PessoaResumoDto } from './importacao.dto';

const TIPOS = [
  'cliente',
  'medico',
  'estudo',
  'modalidade',
  'especialidade',
  'prioridade',
  'prioridade_operacao',
] as const;
const STATUS = ['pendente', 'resolvido', 'ignorado'] as const;

export class ListarAvisosDto extends PaginacaoDto {
  @ApiPropertyOptional({ enum: STATUS, enumName: 'StatusAviso' })
  @IsOptional()
  @IsIn(STATUS)
  status?: (typeof STATUS)[number];

  @ApiPropertyOptional({ enum: TIPOS, enumName: 'TipoAviso' })
  @IsOptional()
  @IsIn(TIPOS)
  tipo?: (typeof TIPOS)[number];

  @ApiPropertyOptional({ description: 'Parte do nome como chegou da MobileMed.' })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;
}

export class AvisoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: TIPOS, enumName: 'TipoAviso' }) tipo!: (typeof TIPOS)[number];
  @ApiProperty({ description: 'Como chegou da MobileMed na última importação ou rodada.' })
  valor!: string;
  @ApiProperty({ enum: STATUS, enumName: 'StatusAviso' }) status!: (typeof STATUS)[number];
  @ApiProperty({
    type: 'integer',
    description: 'Laudos da última importação (ou exames da última rodada) em que apareceu.',
  })
  ocorrencias!: number;
  @ApiProperty({ type: String, format: 'date-time' }) primeiraVezEm!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) ultimaVezEm!: Date;
  @ApiProperty({ type: PessoaResumoDto, nullable: true }) decididoPor!: PessoaResumoDto | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) decididoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) motivo!: string | null;
}

export class PaginaAvisosDto {
  @ApiProperty({ type: [AvisoDto] }) itens!: AvisoDto[];
  @ApiProperty({
    enum: TIPOS,
    enumName: 'TipoAviso',
    isArray: true,
    description: 'Tipos que o usuário vê (os da tela onde cada um se resolve): opções do filtro.',
  })
  tipos!: (typeof TIPOS)[number][];
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) pagina!: number;
  @ApiProperty({ type: 'integer' }) porPagina!: number;
}

export class IgnorarAvisoDto {
  @ApiProperty({ maxLength: 300, example: 'Cliente de teste da MobileMed.' })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty({ message: 'Informe o motivo.' })
  @MaxLength(300)
  motivo!: string;
}

export class ParametrosIngestaoDto {
  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description: 'Trava contra arquivo truncado: recusa se sumiriam mais laudos que isto...',
  })
  @IsInt()
  @Min(0)
  travaRemocaoMinimo!: number;

  @ApiProperty({ minimum: 0, description: '...e mais que este múltiplo das linhas do arquivo.' })
  @IsNumber()
  @Min(0.01)
  @Max(1000)
  travaRemocaoFator!: number;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: 3650,
    description: 'Dias que a linha crua fica guardada.',
  })
  @IsInt()
  @Min(1)
  @Max(3650)
  retencaoLinhasBrutasDias!: number;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    minimum: 5,
    maximum: 1440,
    description: 'Minutos entre duas importações automáticas da MobileMed; vazio = desligada.',
  })
  // Nulo desliga; ausente é recusado (um PUT sem o campo não pode desligar por engano).
  @ValidateIf((_, valor) => valor !== null)
  @IsInt()
  @Min(5)
  @Max(1440)
  mobilemedIntervaloMinutos!: number | null;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    maximum: 12,
    description: 'O período começa no dia 1º de tantos meses atrás (1 = do mês anterior até hoje).',
  })
  @IsInt()
  @Min(0)
  @Max(12)
  mobilemedMesesAnteriores!: number;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: 31,
    description: 'Dias de cada chamada ao relatório da MobileMed (a que vier no teto é dividida).',
  })
  @IsInt()
  @Min(1)
  @Max(31)
  mobilemedJanelaDias!: number;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: 1_000_000,
    description:
      'Limite de itens por chamada da MobileMed (hoje 50.000); resposta no teto é refeita.',
  })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  mobilemedTeto!: number;

  @ApiProperty({
    type: [String],
    maxItems: 20,
    description:
      'Unidades de destino cujo compartilhamento a importação da MobileMed traz (vazia: nenhum).',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  mobilemedCompartilhamentoUnidades!: string[];
}
