import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const aparar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Query string chega como texto: `true`/`false` viram booleano. */
export const booleanoDaQuery = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class PaginacaoDto {
  @ApiPropertyOptional({ type: 'integer', default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina: number = 1;

  @ApiPropertyOptional({ type: 'integer', default: 25, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  porPagina: number = 25;
}

/** Filtro comum das listagens do catálogo: busca por texto e situação. */
export class ListarDto extends PaginacaoDto {
  @ApiPropertyOptional({ description: 'Parte do nome ou da descrição.' })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;

  @ApiPropertyOptional({ type: Boolean })
  @Transform(booleanoDaQuery)
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class IdCriadoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}
