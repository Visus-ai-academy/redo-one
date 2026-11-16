import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsHexColor,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { aparar } from '../../../catalogo/comum/dto';

const TIPOS = ['fixo', 'lista'] as const;

/** Corpo de criar e editar um turno. */
export class TurnoDto {
  @ApiProperty({ example: 'Manhã', maxLength: 60 })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nome!: string;

  @ApiProperty({
    enum: TIPOS,
    enumName: 'TipoTurno',
    description: '`lista`: a Lista de 24 h, com gratificação e regra própria no robô.',
  })
  @IsIn(TIPOS)
  tipo!: (typeof TIPOS)[number];

  @ApiProperty({ example: '07:00', description: '"HH:MM" de Brasília ("7:00" também vale).' })
  @IsString()
  @MaxLength(5)
  horarioInicio!: string;

  @ApiProperty({
    example: '13:00',
    description: 'Antes do início: o turno vira a meia-noite. Igual ao início: 24 h.',
  })
  @IsString()
  @MaxLength(5)
  horarioFim!: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'As frentes do turno (troca o conjunto inteiro; pode ser vazio).',
  })
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  frenteIds!: string[];

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

export class FrenteDoTurnoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() rotulo!: string;
}

export class TurnoItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ enum: TIPOS, enumName: 'TipoTurno' }) tipo!: (typeof TIPOS)[number];
  @ApiProperty({ example: '07:00' }) horarioInicio!: string;
  @ApiProperty({ example: '13:00' }) horarioFim!: string;
  @ApiProperty({ description: 'Duração em minutos (1 a 1440).' }) duracaoMin!: number;
  @ApiProperty({ type: [FrenteDoTurnoDto], description: 'Pela ordem das frentes.' })
  frentes!: FrenteDoTurnoDto[];
  @ApiProperty({ type: String, nullable: true }) descricao!: string | null;
  @ApiProperty({ type: String, nullable: true }) cor!: string | null;
  @ApiProperty() ordem!: number;
  @ApiProperty() ativo!: boolean;
}

export class PaginaTurnosDto {
  @ApiProperty({ type: [TurnoItemDto] }) itens!: TurnoItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}
