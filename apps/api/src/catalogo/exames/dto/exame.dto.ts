import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { aparar, ListarDto } from '../../comum/dto';

export class ListarExamesDto extends ListarDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  modalidadeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  especialidadeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subespecialidadeId?: string;
}

const idOpcional = () => ApiPropertyOptional({ type: String, format: 'uuid', nullable: true });

/** Corpo de criar e editar exame. */
export class ExameDto {
  @ApiProperty({ example: 'TC CRANIO', maxLength: 200 })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nome!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigo: string | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descricao: string | null = null;

  @idOpcional() @IsOptional() @IsUUID() modalidadeId: string | null = null;
  @idOpcional() @IsOptional() @IsUUID() especialidadeId: string | null = null;
  @idOpcional() @IsOptional() @IsUUID() subespecialidadeId: string | null = null;
  @idOpcional() @IsOptional() @IsUUID() categoriaId: string | null = null;
  @idOpcional() @IsOptional() @IsUUID() prioridadeId: string | null = null;

  @ApiProperty() @IsBoolean() permiteQuebra!: boolean;

  @ApiProperty({ description: 'O robô separa para revisão em vez de distribuir.' })
  @IsBoolean()
  exigeRevisaoManual!: boolean;

  @ApiProperty() @IsBoolean() ativo!: boolean;
}

export class ReferenciaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}

const ref = () => ApiProperty({ type: ReferenciaDto, nullable: true });

export class ExameResumoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: String, nullable: true }) codigo!: string | null;
  @ref() modalidade!: ReferenciaDto | null;
  @ref() especialidade!: ReferenciaDto | null;
  @ref() subespecialidade!: ReferenciaDto | null;
  @ref() categoria!: ReferenciaDto | null;
  @ref() prioridade!: ReferenciaDto | null;
  @ApiProperty() exigeRevisaoManual!: boolean;
  @ApiProperty() ativo!: boolean;
}

export class QuebraDoExameDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() totalPecas!: number;
}

const idNulo = () => ApiProperty({ type: String, format: 'uuid', nullable: true });

/** Corpo de mudar só a subespecialidade (`exames.subespecialidade.editar`). */
export class SubespecialidadeExameDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Nula: o exame não vai para médico restrito a uma subespecialidade.',
  })
  @IsOptional()
  @IsUUID()
  subespecialidadeId: string | null = null;
}

export class ExameDetalheDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: String, nullable: true }) codigo!: string | null;
  @ApiProperty({ type: String, nullable: true }) descricao!: string | null;
  @idNulo() modalidadeId!: string | null;
  @idNulo() especialidadeId!: string | null;
  @idNulo() subespecialidadeId!: string | null;
  @idNulo() categoriaId!: string | null;
  @idNulo() prioridadeId!: string | null;
  @ApiProperty() permiteQuebra!: boolean;
  @ApiProperty() exigeRevisaoManual!: boolean;
  @ApiProperty() ativo!: boolean;
  @ApiProperty({
    type: QuebraDoExameDto,
    nullable: true,
    description: 'Quebra do estudo com o mesmo nome deste exame.',
  })
  quebra!: QuebraDoExameDto | null;
}

export class PaginaExamesDto {
  @ApiProperty({ type: [ExameResumoDto] }) itens!: ExameResumoDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}
