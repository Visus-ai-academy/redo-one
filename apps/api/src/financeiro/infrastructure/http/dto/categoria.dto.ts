import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { aparar } from '../../../../catalogo/comum/dto';
import { TIPOS_CATEGORIA, type TipoCategoria } from '../../../domain/categoria-financeira';
import { ListarFinanceiroDto } from './comum.dto';

const TIPO = { enum: TIPOS_CATEGORIA, enumName: 'TipoCategoriaFinanceira' };

export class ListarCategoriasDto extends ListarFinanceiroDto {
  @ApiProperty({ ...TIPO, description: 'A aba: Receitas ou Despesas.' })
  @IsIn(TIPOS_CATEGORIA)
  tipo!: TipoCategoria;
}

export class OpcoesCategoriasDto {
  @ApiPropertyOptional({ ...TIPO, description: 'Sem ele, as dos dois tipos.' })
  @IsOptional()
  @IsIn(TIPOS_CATEGORIA)
  tipo?: TipoCategoria;
}

/** Corpo de criar e editar categoria. */
export class CategoriaDto {
  @ApiProperty(TIPO)
  @IsIn(TIPOS_CATEGORIA)
  tipo!: TipoCategoria;

  @ApiProperty({ example: 'Software e TI', maxLength: 120 })
  @Transform(aparar)
  @IsString()
  @MaxLength(120)
  nome!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Grupo (categoria do nível de cima, do mesmo tipo). Vazio = nível de cima.',
  })
  @IsOptional()
  @IsUUID()
  paiId: string | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '3.2.03', maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  codigoContabil: string | null = null;

  @ApiProperty()
  @IsBoolean()
  ativa!: boolean;
}

export class CategoriaItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty(TIPO) tipo!: TipoCategoria;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) paiId!: string | null;
  @ApiProperty({ type: String, nullable: true }) grupoNome!: string | null;
  @ApiProperty({ type: String, nullable: true }) codigoContabil!: string | null;
  @ApiProperty() ativa!: boolean;
  @ApiProperty({ type: 'integer', description: 'Categorias dentro desta (é um grupo se > 0).' })
  totalFilhas!: number;
}

export class PaginaCategoriasDto {
  @ApiProperty({ type: [CategoriaItemDto] }) itens!: CategoriaItemDto[];
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) pagina!: number;
  @ApiProperty({ type: 'integer' }) porPagina!: number;
}
