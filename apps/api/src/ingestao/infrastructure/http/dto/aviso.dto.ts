import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { aparar, PaginacaoDto } from '../../../../catalogo/comum/dto';
import { UsuarioResumoDto } from './importacao.dto';

const TIPOS = ['cliente', 'medico', 'estudo', 'modalidade', 'especialidade', 'prioridade'] as const;
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
  @ApiProperty({ description: 'Como chegou da MobileMed na última importação.' }) valor!: string;
  @ApiProperty({ enum: STATUS, enumName: 'StatusAviso' }) status!: (typeof STATUS)[number];
  @ApiProperty({ type: 'integer', description: 'Laudos da última importação em que apareceu.' })
  ocorrencias!: number;
  @ApiProperty({ type: String, format: 'date-time' }) primeiraVezEm!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) ultimaVezEm!: Date;
  @ApiProperty({ type: UsuarioResumoDto, nullable: true }) decididoPor!: UsuarioResumoDto | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) decididoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) motivo!: string | null;
}

export class PaginaAvisosDto {
  @ApiProperty({ type: [AvisoDto] }) itens!: AvisoDto[];
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) pagina!: number;
  @ApiProperty({ type: 'integer' }) porPagina!: number;
}

export class IgnorarAvisoDto {
  @ApiPropertyOptional({ maxLength: 300, example: 'Cliente de teste da MobileMed.' })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;
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
}
