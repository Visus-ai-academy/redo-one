import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';

import { PaginacaoDto } from '../../../catalogo/comum/dto';
import { ENTIDADES_ESCALA, type EntidadeEscala } from '../../auditoria-escala';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export class ListarHistoricoDto extends PaginacaoDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  medicoId?: string;

  @ApiPropertyOptional({ enum: ENTIDADES_ESCALA, enumName: 'EntidadeEscala' })
  @IsOptional()
  @IsIn(ENTIDADES_ESCALA)
  entidade?: EntidadeEscala;

  @ApiPropertyOptional({ format: 'date', description: 'Dia de Brasília, inclusivo.' })
  @IsOptional()
  @Matches(DIA, { message: 'Data no formato AAAA-MM-DD.' })
  @IsISO8601({ strict: true }, { message: 'Data inválida.' })
  de?: string;

  @ApiPropertyOptional({ format: 'date', description: 'Dia de Brasília, inclusivo.' })
  @IsOptional()
  @Matches(DIA, { message: 'Data no formato AAAA-MM-DD.' })
  @IsISO8601({ strict: true }, { message: 'Data inválida.' })
  ate?: string;
}

export class AtorHistoricoDto {
  @ApiProperty({ enum: ['usuario', 'robo', 'sistema'] }) tipo!: 'usuario' | 'robo' | 'sistema';
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Usuário ou robô; na carga do legado, quem fez no dashboards-one.',
  })
  nome!: string | null;
}

export class MedicoHistoricoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}

export class ItemHistoricoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() ocorridoEm!: Date;
  @ApiProperty({ type: AtorHistoricoDto }) ator!: AtorHistoricoDto;
  @ApiProperty({ example: 'alocacao' }) entidade!: string;
  @ApiProperty() entidadeId!: string;
  @ApiProperty({ example: 'criado' }) acao!: string;
  @ApiProperty({ type: MedicoHistoricoDto, nullable: true }) medico!: MedicoHistoricoDto | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Campos antes da mudança; `null` na criação.',
  })
  antes!: Record<string, unknown> | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Campos depois da mudança; `null` na remoção.',
  })
  depois!: Record<string, unknown> | null;
}

export class PaginaHistoricoDto {
  @ApiProperty({ type: [ItemHistoricoDto] }) itens!: ItemHistoricoDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}
