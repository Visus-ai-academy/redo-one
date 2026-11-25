import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { RegraRecebimentoDto } from './prioridades-operacao.dto';

const SITUACOES = ['futura', 'vigente', 'encerrada'] as const;

/** Uma exceção temporária da grade de recebimento, como a tela edita. */
export class ExcecaoRecebimentoEdicaoDto {
  @ApiProperty({ format: 'uuid', description: 'Turno da escala.' })
  @IsUUID()
  turnoId!: string;

  @ApiProperty({
    description:
      'Vale todas as frentes (especialidade e modalidade null). Sem ele, uma das duas é obrigatória.',
  })
  @IsBoolean()
  todasFrentes!: boolean;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Sem `todasFrentes`: só esta especialidade (frente). Não junto com a modalidade.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  especialidadeId!: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Sem `todasFrentes`: só esta modalidade (frente). Não junto com a especialidade.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  modalidadeId!: string | null;

  @ApiProperty({
    description:
      'Vale todas as prioridades (prioridade null). Sem ele, a prioridade é obrigatória.',
  })
  @IsBoolean()
  todasPrioridades!: boolean;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Sem `todasPrioridades`: só esta prioridade da operação.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  prioridadeOperacaoId!: string | null;

  @ApiProperty({ type: RegraRecebimentoDto })
  @IsObject()
  @ValidateNested()
  @Type(() => RegraRecebimentoDto)
  regra!: RegraRecebimentoDto;

  @ApiProperty({ format: 'date', description: 'Primeiro dia (Brasília), inclusivo.' })
  @IsString()
  @MaxLength(10)
  de!: string;

  @ApiProperty({ format: 'date', description: 'Último dia (Brasília), inclusivo.' })
  @IsString()
  @MaxLength(10)
  ate!: string;
}

export class ExcecaoRecebimentoDto extends ExcecaoRecebimentoEdicaoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time' })
  criadoEm!: string;

  @ApiProperty({ enum: SITUACOES, enumName: 'SituacaoExcecaoRecebimento' })
  situacao!: (typeof SITUACOES)[number];

  @ApiProperty({ description: 'Ainda não valeu em dia passado: pode ser excluída.' })
  podeExcluir!: boolean;

  @ApiProperty({
    type: [String],
    description:
      'Exceções que empatam com esta em algum exame (mesmo turno, período e especificidade): ' +
      'vale a criada por último.',
  })
  empatesIds!: string[];
}
