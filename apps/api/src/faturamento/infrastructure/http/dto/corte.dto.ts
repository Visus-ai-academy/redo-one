import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

import { MENSAGEM_COMPETENCIA, PADRAO_COMPETENCIA } from './competencia.dto';

const MESES = ['proprio', 'seguinte'] as const;

export class ListarCortesQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Sem cliente = o corte padrão.' })
  @IsOptional()
  @IsUUID()
  clienteId?: string;
}

/** Campos do corte, iguais na vigência gravada e no pedido de nova. */
class CamposCorteDto {
  @ApiProperty({ description: 'Só com cliente: a partir de `desde`, ele segue o corte padrão.' })
  @IsBoolean()
  usaPadrao!: boolean;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    minimum: 1,
    maximum: 31,
    description:
      'Dia do mês, pela data do laudo, até o qual vai a competência; maior que o mês vale o último dia. Vazio com `ultimoDia` ou `usaPadrao`.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(31)
  dia!: number | null;

  @ApiProperty({ description: 'O corte é o último dia do mês.' })
  @IsBoolean()
  ultimoDia!: boolean;

  @ApiProperty({
    enum: MESES,
    enumName: 'MesCorte',
    nullable: true,
    description: '`seguinte`: o corte cai no mês M+1; `proprio`: no próprio mês M.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsIn(MESES)
  mes!: (typeof MESES)[number] | null;

  @ApiProperty({
    type: Boolean,
    nullable: true,
    description:
      'A competência é o maior entre o mês da data do laudo e o da data do exame, cada um pelo seu corte; sem isso, só o laudo.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsBoolean()
  consideraExame!: boolean | null;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    minimum: 1,
    maximum: 31,
    description:
      'Dia do mês, pela data do exame, até o qual vai a competência; maior que o mês vale o último dia. Vale com `consideraExame`. Vazio com `exameUltimoDia` ou `usaPadrao`.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(31)
  exameDia!: number | null;

  @ApiProperty({ description: 'O corte da data do exame é o último dia do mês.' })
  @IsBoolean()
  exameUltimoDia!: boolean;

  @ApiProperty({
    enum: MESES,
    enumName: 'MesCorte',
    nullable: true,
    description:
      'Corte da data do exame. `seguinte`: cai no mês M+1; `proprio`: no próprio mês M. Vazio com `usaPadrao`.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsIn(MESES)
  exameMes!: (typeof MESES)[number] | null;
}

export class NovaVigenciaCorteDto extends CamposCorteDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Nulo = o corte padrão.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  clienteId!: string | null;

  @ApiProperty({
    example: '2026-12',
    pattern: PADRAO_COMPETENCIA.source,
    description: 'Competência a partir da qual vale; depois da última competência fechada.',
  })
  @Matches(PADRAO_COMPETENCIA, { message: `desde: ${MENSAGEM_COMPETENCIA}` })
  desde!: string;
}

export class VigenciaCorteDto extends NovaVigenciaCorteDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'date-time' }) criadoEm!: Date;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Quem criou; vazio na vigência padrão inicial.',
  })
  criadoPor!: string | null;
}

export class MovimentoPreviaDto {
  @ApiProperty({ example: '2026-11', description: 'Competência atual.' }) de!: string;
  @ApiProperty({ example: '2026-12', description: 'Competência com o novo corte.' }) para!: string;
  @ApiProperty({ type: 'integer' }) laudos!: number;
}

export class PreviaCorteDto {
  @ApiProperty({ type: 'integer', description: 'Laudos que mudam de competência.' })
  alterados!: number;
  @ApiProperty({ type: [MovimentoPreviaDto] }) movimentos!: MovimentoPreviaDto[];
}
