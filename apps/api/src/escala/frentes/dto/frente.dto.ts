import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsHexColor,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { aparar } from '../../../catalogo/comum/dto';

const TIPOS = ['especialidade', 'modalidade'] as const;

/** Corpo de criar e editar uma frente da escala. */
export class FrenteDto {
  @ApiProperty({ enum: TIPOS, enumName: 'TipoFrenteEscala' })
  @IsIn(TIPOS)
  tipo!: (typeof TIPOS)[number];

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Obrigatório (e o único) na frente de especialidade.',
  })
  @IsOptional()
  @IsUUID()
  especialidadeId: string | null = null;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Obrigatório (e o único) na frente de modalidade.',
  })
  @IsOptional()
  @IsUUID()
  modalidadeId: string | null = null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 60,
    example: 'MSK',
    description: 'Nome na escala. Vazio: o nome da especialidade ou o código da modalidade.',
  })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  rotulo: string | null = null;

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

export class FrenteItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: TIPOS, enumName: 'TipoFrenteEscala' }) tipo!: (typeof TIPOS)[number];
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) especialidadeId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) modalidadeId!: string | null;
  @ApiProperty({ description: 'Nome da especialidade ou código da modalidade no catálogo.' })
  destinoNome!: string;
  @ApiProperty() rotulo!: string;
  @ApiProperty({ type: String, nullable: true }) descricao!: string | null;
  @ApiProperty({ type: String, nullable: true }) cor!: string | null;
  @ApiProperty() ordem!: number;
  @ApiProperty() ativo!: boolean;
}

export class PaginaFrentesDto {
  @ApiProperty({ type: [FrenteItemDto] }) itens!: FrenteItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}
