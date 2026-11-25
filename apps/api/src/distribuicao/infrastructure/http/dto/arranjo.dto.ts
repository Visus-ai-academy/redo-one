import { ApiProperty, ApiPropertyOptional, type ApiPropertyOptions } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const MODOS = ['todos', 'apenas', 'exceto'] as const;
const UNIDADES_TETO = ['exames', 'laudos'] as const;
const DESCRICAO_UNIDADE_TETO =
  'Em que o teto do médico é contado: exames (cada exame vale 1) ou laudos (soma os laudos do exame). Vale também para a carga em mãos e a cota gratificada.';
const lista = (descricao: string): ApiPropertyOptions => ({
  type: [String],
  format: 'uuid',
  description: descricao,
});

/**
 * Um arranjo: a frente (uma especialidade OU uma modalidade) e o recorte da outra dimensão; em
 * cada eixo, lista vazia = todos.
 */
export class ArranjoDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Frente de especialidade. Exatamente uma das frentes (esta ou `modalidadeId`).',
  })
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  especialidadeId!: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Frente de modalidade. Exatamente uma das frentes (esta ou `especialidadeId`).',
  })
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  modalidadeId!: string | null;

  @ApiProperty(lista('Só na frente de modalidade: especialidades; vazia = todas.'))
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  especialidadeIds!: string[];

  @ApiProperty(lista('Só na frente de especialidade: modalidades; vazia = todas.'))
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  modalidadeIds!: string[];

  @ApiProperty(lista('Só na frente de especialidade: segmentos; vazia e sem o geral = todos.'))
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  subespecialidadeIds!: string[];

  @ApiProperty({ description: 'O recorte de segmento inclui o exame sem segmento (geral).' })
  @IsBoolean()
  subespecialidadeGeral!: boolean;

  @ApiProperty(lista('Prioridades da operação (Configurações › Distribuição); vazia = todas.'))
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  prioridadeIds!: string[];

  @ApiProperty({ enum: MODOS, enumName: 'ModoVinculo' })
  @IsIn(MODOS)
  modoClientes!: (typeof MODOS)[number];

  @ApiProperty(lista('Clientes, lidos conforme o modo.'))
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  clienteIds!: string[];

  @ApiProperty({ enum: MODOS, enumName: 'ModoVinculo' })
  @IsIn(MODOS)
  modoExames!: (typeof MODOS)[number];

  @ApiProperty(lista('Exames, lidos conforme o modo.'))
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID('all', { each: true })
  exameIds!: string[];

  @ApiProperty(lista('Clínicas exclusivas (só em arranjo de médico).'))
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  clientesExclusivosIds!: string[];
}

export class SalvarArranjosDto {
  @ApiProperty({ type: [ArranjoDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ArranjoDto)
  arranjos!: ArranjoDto[];
}

export class RotuloDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}

/** Prioridade da operação que o arranjo pode marcar. */
export class PrioridadeDoArranjoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Hex `#RRGGBB`; null = neutra.' })
  cor!: string | null;
}

export class ArranjosDoDonoDto {
  @ApiProperty({ type: [ArranjoDto] }) arranjos!: ArranjoDto[];
  @ApiProperty({ type: [RotuloDto], description: 'Nomes dos clientes marcados.' })
  clientes!: RotuloDto[];
  @ApiProperty({ type: [RotuloDto], description: 'Nomes dos exames marcados.' })
  exames!: RotuloDto[];
  @ApiProperty({
    type: [PrioridadeDoArranjoDto],
    description: 'Prioridades da operação (as do recorte), pela posição.',
  })
  prioridades!: PrioridadeDoArranjoDto[];
}

/** Só os campos enviados mudam. */
export class RoboMedicoDto {
  @ApiPropertyOptional({ description: 'O robô pode entregar exames a ele.' })
  @IsOptional()
  @IsBoolean()
  habilitadoRobo?: boolean;

  @ApiPropertyOptional({
    enum: UNIDADES_TETO,
    enumName: 'UnidadeTeto',
    description: DESCRICAO_UNIDADE_TETO,
  })
  @IsOptional()
  @IsIn(UNIDADES_TETO)
  unidadeTeto?: (typeof UNIDADES_TETO)[number];
}

export class DistribuicaoMedicoDto extends ArranjosDoDonoDto {
  @ApiProperty() habilitadoRobo!: boolean;
  @ApiProperty({
    enum: UNIDADES_TETO,
    enumName: 'UnidadeTeto',
    description: DESCRICAO_UNIDADE_TETO,
  })
  unidadeTeto!: (typeof UNIDADES_TETO)[number];
}

export class UsoEquipeDto {
  @ApiProperty({
    description:
      'Falso: o recorte dos arranjos da equipe vai só para os membros. Verdadeiro (plantão): o robô não o entrega a ninguém; fica para laudar à mão.',
  })
  @IsBoolean()
  plantao!: boolean;
}

export class DistribuicaoEquipeDto extends ArranjosDoDonoDto {
  @ApiProperty({ description: 'Equipe de plantão: o robô não entrega o recorte dela.' })
  plantao!: boolean;
}

export class SugestaoAlocacaoQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  medicoId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  frenteId!: string;
}

export class SugestaoAlocacaoDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Prioridades da operação.' })
  prioridadeIds!: string[];
  @ApiProperty({ type: [String], format: 'uuid' }) subespecialidadeIds!: string[];
  @ApiProperty() subespecialidadeGeral!: boolean;
}

export class RespostaSugestaoAlocacaoDto {
  @ApiProperty({
    type: SugestaoAlocacaoDto,
    nullable: true,
    description: 'Nula quando nenhum arranjo do médico é da frente.',
  })
  sugestao!: SugestaoAlocacaoDto | null;
}
