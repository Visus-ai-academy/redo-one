import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import type { TipoChavePix } from '../pagamento-medico.repository';

const TIPOS_CHAVE_PIX: TipoChavePix[] = ['CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA'];

/** Dados de pagamento do médico; o mesmo formato serve para ler e para salvar. */
export class PagamentoMedicoDto {
  @ApiPropertyOptional({ type: String, nullable: true, example: '000.000.000-00' })
  @IsOptional()
  @IsString()
  @MaxLength(14)
  cpf: string | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '12.345.678/0001-90' })
  @IsOptional()
  @IsString()
  @MaxLength(18)
  cnpj: string | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  razaoSocial: string | null = null;

  @ApiPropertyOptional({ enum: TIPOS_CHAVE_PIX, nullable: true })
  @IsOptional()
  @IsIn(TIPOS_CHAVE_PIX)
  tipoChavePix: TipoChavePix | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 140 })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  chavePix: string | null = null;

  @ApiProperty({
    type: Boolean,
    nullable: true,
    description:
      'Sócio da empresa ou não (o financeiro paga sócio e não sócio de formas diferentes); nulo = não informado.',
  })
  @IsOptional()
  @IsBoolean()
  socio: boolean | null = null;

  @ApiProperty({ type: Boolean, nullable: true })
  @IsOptional()
  @IsBoolean()
  optanteSimples: boolean | null = null;
}
