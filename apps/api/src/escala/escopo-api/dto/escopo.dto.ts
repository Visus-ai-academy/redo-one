import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export class ReferenciaEscopoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Manhã' }) nome!: string;
}

/** Corpo do PUT: o recorte inteiro. Listas vazias tiram o recorte (vê tudo que a permissão deixa). */
export class DefinirEscopoDto {
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
    description: '`null`: sem recorte, vê a escala inteira.',
  })
  escopo!: EscopoDto | null;
}
