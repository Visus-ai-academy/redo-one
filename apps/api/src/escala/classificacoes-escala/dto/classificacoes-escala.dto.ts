import { ApiProperty } from '@nestjs/swagger';

export class PrioridadeEscalaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty() ativo!: boolean;
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
