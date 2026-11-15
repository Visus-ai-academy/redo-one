import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { aparar, PaginacaoDto } from '../../comum/dto';

export class ListarQuebrasDto extends PaginacaoDto {
  @ApiPropertyOptional({
    description: 'Parte do nome do estudo ou de um exame em que ele se quebra.',
  })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;
}

/** Corpo de criar e renomear a quebra. */
export class QuebraDto {
  @ApiProperty({ example: 'TC TORAX E ABDOME', maxLength: 300 })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  estudoOrigem!: string;
}

export class PecaDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() exameId!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Usada só quando o exame não tem categoria.',
  })
  @IsOptional()
  @IsUUID()
  categoriaId: string | null = null;

  @ApiProperty() @IsBoolean() ativo!: boolean;
}

export class ReferenciaQuebraDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}

export class PecaResumoDto {
  @ApiProperty() nome!: string;
  @ApiProperty() ativo!: boolean;
}

export class QuebraResumoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() estudoOrigem!: string;
  @ApiProperty({ type: [PecaResumoDto] }) pecas!: PecaResumoDto[];
  @ApiProperty({
    type: ReferenciaQuebraDto,
    nullable: true,
    description: 'O exame do cadastro com o mesmo nome do estudo.',
  })
  exame!: ReferenciaQuebraDto | null;
}

export class PaginaQuebrasDto {
  @ApiProperty({ type: [QuebraResumoDto] }) itens!: QuebraResumoDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}

export class PecaItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: ReferenciaQuebraDto }) exame!: ReferenciaQuebraDto;
  @ApiProperty({ type: ReferenciaQuebraDto, nullable: true })
  categoria!: ReferenciaQuebraDto | null;
  @ApiProperty() ativo!: boolean;
}

export class QuebraDetalheDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() estudoOrigem!: string;
  @ApiProperty({ type: ReferenciaQuebraDto, nullable: true }) exame!: ReferenciaQuebraDto | null;
  @ApiProperty({ type: [PecaItemDto] }) pecas!: PecaItemDto[];
}
