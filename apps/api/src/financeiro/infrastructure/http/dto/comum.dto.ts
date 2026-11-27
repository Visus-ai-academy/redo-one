import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { aparar, PaginacaoDto } from '../../../../catalogo/comum/dto';

/** "Todas" é escolha explícita: o filtro nunca vem vazio. */
export const SITUACOES_FILTRO = ['todas', 'ativas', 'inativas'] as const;

/** Busca e situação, comuns às listas do financeiro. */
export class ListarFinanceiroDto extends PaginacaoDto {
  @ApiPropertyOptional({ description: 'Parte do nome, do documento ou do código.' })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;

  @ApiProperty({ enum: SITUACOES_FILTRO, enumName: 'SituacaoFiltro' })
  @IsIn(SITUACOES_FILTRO)
  situacao!: (typeof SITUACOES_FILTRO)[number];
}
