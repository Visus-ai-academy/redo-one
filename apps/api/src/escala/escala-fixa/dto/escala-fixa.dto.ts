import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { AvisoConflitoDto } from '../../alocacoes/dto/alocacao.dto';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Uma célula da grade: o médico no turno nesse dia da semana. */
export class CelulaEscalaFixaDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  turnoId!: string;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    maximum: 6,
    description: '0 = domingo … 6 = sábado.',
  })
  @IsInt()
  @Min(0)
  @Max(6)
  diaSemana!: number;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    minimum: 0,
    description: 'Registros por turno; nulo = não informada.',
  })
  @ValidateIf((o: CelulaEscalaFixaDto) => o.produtividade !== null)
  @IsInt()
  @Min(0)
  produtividade!: number | null;
}

/** Query da leitura da grade. */
export class EscalaFixaQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  frenteId!: string;
}

/** A grade do médico na frente, montada das alocações fixas simples. */
export class EscalaFixaDto {
  @ApiProperty({ format: 'uuid' }) medicoId!: string;
  @ApiProperty({ format: 'uuid' }) frenteId!: string;
  @ApiProperty({
    type: [CelulaEscalaFixaDto],
    description:
      'Das alocações fixas (sem fim) que não são cobertura nem gratificadas, repetem toda semana, usam o horário do turno e não têm recorte. Fora do recorte da gestora não aparecem.',
  })
  celulas!: CelulaEscalaFixaDto[];
  @ApiProperty({
    type: 'integer',
    description:
      'Outras alocações fixas do médico na frente (com regra especial): continuam valendo e se editam pelo formulário.',
  })
  foraDaGrade!: number;
}

/** Corpo de salvar a grade. */
export class DefinirEscalaFixaDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  frenteId!: string;

  @ApiProperty({
    format: 'date',
    description:
      'Quem mudou e começou antes termina na véspera; quem começa nesse dia ou depois sai.',
  })
  @Matches(DIA, { message: 'Data no formato AAAA-MM-DD.' })
  @IsISO8601({ strict: true }, { message: 'Data inválida.' })
  aPartirDe!: string;

  @ApiProperty({
    type: [CelulaEscalaFixaDto],
    description: 'Cada turno + dia uma vez só. Vazio = encerra ou remove todas as da grade.',
  })
  @IsArray()
  @ArrayMaxSize(700)
  @ValidateNested({ each: true })
  @Type(() => CelulaEscalaFixaDto)
  celulas!: CelulaEscalaFixaDto[];
}

export class ResultadoEscalaFixaDto {
  @ApiProperty({ type: 'integer' }) criadas!: number;
  @ApiProperty({ type: 'integer' }) encerradas!: number;
  @ApiProperty({ type: 'integer' }) removidas!: number;
  @ApiProperty({ type: 'integer' }) mantidas!: number;
  @ApiProperty({
    type: [AvisoConflitoDto],
    description:
      'Sobreposições de horário das alocações criadas nas próximas 8 semanas (não bloqueiam). A ponta fora do recorte vem só com `foraDoRecorte` e `data`.',
  })
  avisos!: AvisoConflitoDto[];
}
