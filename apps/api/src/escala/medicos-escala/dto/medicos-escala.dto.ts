import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

import { aparar, booleanoDaQuery, PaginacaoDto } from '../../../catalogo/comum/dto';

export class ListarMedicosEscalaDto extends PaginacaoDto {
  @ApiPropertyOptional({ description: 'Parte do nome; sem acento nem maiúscula importando.' })
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

export class MedicoEscalaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty() ativo!: boolean;
}

export class PaginaMedicosEscalaDto {
  @ApiProperty({ type: [MedicoEscalaDto] }) itens!: MedicoEscalaDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}
