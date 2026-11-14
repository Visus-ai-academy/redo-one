import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { aparar, ListarDto } from '../../comum/dto';
import type { TipoDeParaEspecialidade } from '../de-para.repository';

const TIPOS: TipoDeParaEspecialidade[] = ['normalizacao', 'invalida', 'regiao_anatomica'];

export class ListarDeParaEspecialidadeDto extends ListarDto {
  @ApiPropertyOptional({ enum: TIPOS })
  @IsOptional()
  @IsIn(TIPOS)
  tipo?: TipoDeParaEspecialidade;
}

const origem = (exemplo: string) =>
  ApiProperty({ example: exemplo, maxLength: 150, description: 'Como chega da MobileMed.' });

export class DeParaPrioridadeDto {
  @origem('ELETIVO')
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  origem!: string;

  @ApiProperty({ format: 'uuid' }) @IsUUID() prioridadeId!: string;
  @ApiProperty() @IsBoolean() ativo!: boolean;
}

export class DeParaEspecialidadeDto {
  @ApiProperty({ enum: TIPOS }) @IsIn(TIPOS) tipo!: TipoDeParaEspecialidade;

  @origem('MAMO')
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  origem!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Vazio só em inválida.',
  })
  @IsOptional()
  @IsUUID()
  especialidadeId: string | null = null;

  @ApiProperty() @IsBoolean() ativo!: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacoes: string | null = null;
}

export class DeParaValorDto {
  @origem('RM CRANIO')
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  estudoDescricao!: string;

  @ApiProperty({ minimum: 0, maximum: 999, description: 'Unidades que o laudo vale.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999)
  valores!: number;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  exameId: string | null = null;

  @ApiProperty() @IsBoolean() ativo!: boolean;
}

export class SufixoDto {
  @ApiProperty({ example: '_PLANTÃO', maxLength: 50 })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  sufixo!: string;

  @ApiProperty() @IsBoolean() ativo!: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacoes: string | null = null;
}

const destinoNome = () => ApiProperty({ type: String, nullable: true });
const nulo = () => ApiProperty({ type: String, nullable: true });
const idNulo = () => ApiProperty({ type: String, format: 'uuid', nullable: true });

export class DeParaPrioridadeItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() origem!: string;
  @ApiProperty({ format: 'uuid' }) prioridadeId!: string;
  @ApiProperty() ativo!: boolean;
  @destinoNome() destinoNome!: string | null;
}

export class DeParaEspecialidadeItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: TIPOS }) tipo!: TipoDeParaEspecialidade;
  @ApiProperty() origem!: string;
  @idNulo() especialidadeId!: string | null;
  @ApiProperty() ativo!: boolean;
  @nulo() observacoes!: string | null;
  @destinoNome() destinoNome!: string | null;
}

export class DeParaValorItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() estudoDescricao!: string;
  @ApiProperty() valores!: number;
  @idNulo() exameId!: string | null;
  @ApiProperty() ativo!: boolean;
  @destinoNome() destinoNome!: string | null;
}

export class SufixoItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() sufixo!: string;
  @ApiProperty() ativo!: boolean;
  @nulo() observacoes!: string | null;
}

class PaginaBase {
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}

export class PaginaDeParaPrioridadeDto extends PaginaBase {
  @ApiProperty({ type: [DeParaPrioridadeItemDto] }) itens!: DeParaPrioridadeItemDto[];
}

export class PaginaDeParaEspecialidadeDto extends PaginaBase {
  @ApiProperty({ type: [DeParaEspecialidadeItemDto] }) itens!: DeParaEspecialidadeItemDto[];
}

export class PaginaDeParaValorDto extends PaginaBase {
  @ApiProperty({ type: [DeParaValorItemDto] }) itens!: DeParaValorItemDto[];
}

export class PaginaSufixosDto extends PaginaBase {
  @ApiProperty({ type: [SufixoItemDto] }) itens!: SufixoItemDto[];
}
