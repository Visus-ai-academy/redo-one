import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { aparar } from '../../../../catalogo/comum/dto';
import { MENSAGEM_COMPETENCIA, PADRAO_COMPETENCIA } from './competencia.dto';

export class CriarAjusteLaudoDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() laudoId!: string;
  @ApiProperty({ enum: ['valor', 'excluir'], enumName: 'TipoAjusteLaudo' })
  @IsIn(['valor', 'excluir'])
  tipo!: 'valor' | 'excluir';
  @ApiProperty({
    type: 'integer',
    nullable: true,
    minimum: 0,
    description: 'Só no tipo valor: o unitário cobrado pelo laudo, em centavos.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  valorUnitarioCentavos!: number | null;
  @ApiProperty({ maxLength: 1000, description: 'Obrigatório: fica no histórico.' })
  @Transform(aparar)
  @IsString()
  @MaxLength(1000)
  motivo!: string;
}

export class EncerrarAjusteLaudoDto {
  @ApiProperty({ maxLength: 1000 })
  @Transform(aparar)
  @IsString()
  @MaxLength(1000)
  motivo!: string;
}

export class AjustesLaudoQueryDto {
  @ApiProperty({ example: '2026-10', pattern: PADRAO_COMPETENCIA.source })
  @Matches(PADRAO_COMPETENCIA, { message: `competencia: ${MENSAGEM_COMPETENCIA}` })
  competencia!: string;
}

export class AjusteLaudoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() laudoIdentidade!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) laudoId!: string | null;
  @ApiProperty() competencia!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) clienteId!: string | null;
  @ApiProperty({ enum: ['valor', 'excluir'], enumName: 'TipoAjusteLaudo' }) tipo!:
    | 'valor'
    | 'excluir';
  @ApiProperty({ type: 'integer', nullable: true }) valorUnitarioCentavos!: number | null;
  @ApiProperty() motivo!: string;
  @ApiProperty({ type: String, format: 'date-time' }) criadoEm!: Date;
  @ApiProperty({ format: 'uuid' }) criadoPorId!: string;
  @ApiProperty({ type: String, nullable: true }) criadoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) encerradoEm!: Date | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) encerradoPorId!: string | null;
  @ApiProperty({ type: String, nullable: true }) encerradoPor!: string | null;
  @ApiProperty({ type: String, nullable: true }) motivoEncerramento!: string | null;
}

export class AjusteCriadoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}
