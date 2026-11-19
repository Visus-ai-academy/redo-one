import { ApiProperty } from '@nestjs/swagger';

/** Prioridade da operação (Configurações › Distribuição): o recorte de prioridade da alocação. */
export class PrioridadeEscalaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Hex `#RRGGBB`; null = neutra.' })
  cor!: string | null;
}

export class SubespecialidadeEscalaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty() ativo!: boolean;
  @ApiProperty({ type: [String], format: 'uuid' }) especialidadeIds!: string[];
}

export class ClassificacoesEscalaDto {
  @ApiProperty({ type: [PrioridadeEscalaDto] }) prioridades!: PrioridadeEscalaDto[];
  @ApiProperty({ type: [SubespecialidadeEscalaDto] })
  subespecialidades!: SubespecialidadeEscalaDto[];
}
