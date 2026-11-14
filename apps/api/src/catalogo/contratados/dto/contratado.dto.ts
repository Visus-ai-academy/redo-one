import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { aparar } from '../../comum/dto';

/** Corpo de criar e editar contratado. */
export class ContratadoDto {
  @ApiProperty({ example: '001 TELEIMAGEM LTDA', maxLength: 150 })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  razaoSocial!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '12.345.678/0001-90' })
  @IsOptional()
  @IsString()
  @MaxLength(18)
  cnpj: string | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  endereco: string | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cidade: string | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'SP' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  uf: string | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '01310-100' })
  @IsOptional()
  @IsString()
  @MaxLength(9)
  cep: string | null = null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  contratadoRepasseId: string | null = null;

  @ApiProperty()
  @IsBoolean()
  ativo!: boolean;
}

export class ContratadoItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() razaoSocial!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Só dígitos.' }) cnpj!: string | null;
  @ApiProperty({ type: String, nullable: true }) endereco!: string | null;
  @ApiProperty({ type: String, nullable: true }) cidade!: string | null;
  @ApiProperty({ type: String, nullable: true }) uf!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Só dígitos.' }) cep!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) contratadoRepasseId!:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) contratadoRepasseNome!: string | null;
  @ApiProperty() ativo!: boolean;
}

export class PaginaContratadosDto {
  @ApiProperty({ type: [ContratadoItemDto] }) itens!: ContratadoItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}
