import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * O que o ajuste do dia muda na distribuição. Nada liberado e a Lista como sempre = remove o
 * ajuste. O "+N laudos" é o ajuste de produtividade da escala (`PUT /escala/alocacoes/:id/ajustes/:data`).
 */
export class AjusteDiaEdicaoDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Prioridades do catálogo liberadas no dia, além do arranjo e da Lista.',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  prioridadeIdsLiberadas!: string[];

  @ApiProperty({
    description: 'Segue o SLA neste dia: o prazo mínimo da grade de recebimento não vale para ele.',
  })
  @IsBoolean()
  segueSla!: boolean;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Só os exames deste cliente; nulo = todos.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  clienteId!: string | null;
}

export class AjusteDiaDto extends AjusteDiaEdicaoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) alocacaoId!: string;
  @ApiProperty({ format: 'date' }) data!: string;
  @ApiProperty({ format: 'uuid' }) medicoId!: string;
  @ApiProperty({ format: 'uuid' }) turnoId!: string;
  @ApiProperty({ format: 'uuid' }) frenteId!: string;
  @ApiProperty({ type: String, nullable: true }) clienteNome!: string | null;
}

export class RespostaAjusteDiaDto {
  @ApiProperty({ type: AjusteDiaDto, nullable: true, description: 'Nulo = sem ajuste no dia.' })
  ajuste!: AjusteDiaDto | null;
}

export class AjustesDiaQueryDto {
  @ApiProperty({ format: 'date', description: 'Início do período (até 42 dias).' })
  @IsString()
  @MaxLength(10)
  de!: string;

  @ApiProperty({ format: 'date' })
  @IsString()
  @MaxLength(10)
  ate!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  medicoId?: string;
}
