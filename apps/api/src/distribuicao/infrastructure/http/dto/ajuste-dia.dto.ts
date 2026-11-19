import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * O que o ajuste do dia muda na distribuição. Nada liberado, a Lista como sempre e sem extra =
 * remove o ajuste. O "+N laudos" de todos os exames é o ajuste de produtividade da escala
 * (`PUT /escala/alocacoes/:id/ajustes/:data`); aqui, só o de um cliente.
 */
export class AjusteDiaEdicaoDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Prioridades da operação liberadas no dia, além do arranjo e da alocação.',
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

  @ApiProperty({
    minimum: 0,
    maximum: 500,
    description: 'Laudos acima do teto só para os exames do cliente (exige o cliente); 0 = nenhum.',
  })
  @IsInt()
  @Min(0)
  @Max(500)
  laudosExtra!: number;
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
