import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsUUID, ValidateIf, ValidateNested } from 'class-validator';

/** Prioridade do cliente numa frente: informe a especialidade OU a modalidade. */
export class PrioridadeClienteDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  especialidadeId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  modalidadeId!: string | null;

  @ApiProperty({ description: '1 = Alta, 2 = Média. Frente sem linha = normal.' })
  @IsInt()
  nivel!: number;
}

export class PrioridadesClienteDto {
  @ApiProperty({ type: [PrioridadeClienteDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PrioridadeClienteDto)
  prioridades!: PrioridadeClienteDto[];
}
