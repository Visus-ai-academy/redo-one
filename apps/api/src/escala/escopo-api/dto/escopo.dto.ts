import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsUUID } from 'class-validator';

export class ReferenciaEscopoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Manhã' }) nome!: string;
}

/**
 * Corpo do PUT: o recorte inteiro. "Vê toda a escala" é explícito; sem ele, ao menos um turno ou
 * frente (vazio nunca é "toda a escala").
 */
export class DefinirEscopoDto {
  @ApiProperty({
    description: 'Vê toda a escala (sem recorte). Sem ele, ao menos um turno ou uma frente.',
  })
  @IsBoolean()
  veTodaEscala!: boolean;

  @ApiProperty({ type: [String], format: 'uuid', description: 'Turnos liberados.' })
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  turnoIds!: string[];

  @ApiProperty({ type: [String], format: 'uuid', description: 'Frentes liberadas.' })
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  frenteIds!: string[];
}

/** Recorte da gestora: ela vê o que estiver num dos turnos OU numa das frentes. */
export class EscopoDto {
  @ApiProperty({ description: 'Vê toda a escala (sem recorte).' }) veTodaEscala!: boolean;
  @ApiProperty({ type: [String], format: 'uuid' }) turnoIds!: string[];
  @ApiProperty({ type: [String], format: 'uuid' }) frenteIds!: string[];
  @ApiProperty({ type: [ReferenciaEscopoDto] }) turnos!: ReferenciaEscopoDto[];
  @ApiProperty({ type: [ReferenciaEscopoDto], description: 'Nome = rótulo da frente.' })
  frentes!: ReferenciaEscopoDto[];
}

export class MeuEscopoDto {
  @ApiProperty({
    type: EscopoDto,
    nullable: true,
    description: '`null`: vê a escala inteira (acesso total ou "vê toda a escala").',
  })
  escopo!: EscopoDto | null;
}
