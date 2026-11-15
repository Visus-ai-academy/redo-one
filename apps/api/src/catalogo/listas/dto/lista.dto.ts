import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsHexColor,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { aparar } from '../../comum/dto';

/** Corpo de criar e editar um item de lista (modalidade, especialidade, categoria). */
export class ListaDto {
  @ApiProperty({
    example: 'NEURO',
    maxLength: 60,
    description: 'Na modalidade, o código (MR, CT).',
  })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nome!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  descricao: string | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '#1F7A4D' })
  @IsOptional()
  @IsHexColor()
  cor: string | null = null;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 9999 })
  @IsInt()
  @Min(0)
  @Max(9999)
  ordem!: number;

  @ApiProperty()
  @IsBoolean()
  ativo!: boolean;
}

export class PrioridadeDto extends ListaDto {
  @ApiProperty({ description: 'Urgente para a distribuição.' })
  @IsBoolean()
  urgente!: boolean;
}

export class SubespecialidadeDto extends ListaDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Ao menos uma.' })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  especialidadeIds!: string[];
}

export class ItemListaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: String, nullable: true }) descricao!: string | null;
  @ApiProperty({ type: String, nullable: true }) cor!: string | null;
  @ApiProperty() ordem!: number;
  @ApiProperty() ativo!: boolean;
  @ApiPropertyOptional({
    description: 'Variações que chegam da MobileMed (só prioridades e especialidades).',
  })
  totalVariacoes?: number;
}

export class PrioridadeItemDto extends ItemListaDto {
  @ApiProperty() urgente!: boolean;
}

export class PaginaListaDto {
  @ApiProperty({ type: [ItemListaDto] }) itens!: ItemListaDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}

export class PaginaPrioridadesDto extends PaginaListaDto {
  @ApiProperty({ type: [PrioridadeItemDto] }) declare itens: PrioridadeItemDto[];
}

export class SubespecialidadeItemDto extends ItemListaDto {
  @ApiProperty({ type: [String], format: 'uuid' }) especialidadeIds!: string[];
}

export class PaginaSubespecialidadesDto extends PaginaListaDto {
  @ApiProperty({ type: [SubespecialidadeItemDto] }) declare itens: SubespecialidadeItemDto[];
}
