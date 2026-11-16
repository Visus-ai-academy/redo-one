import { ApiProperty } from '@nestjs/swagger';

const TIPOS = ['especialidade', 'modalidade'] as const;

export class FrenteItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: TIPOS, enumName: 'TipoFrenteEscala' }) tipo!: (typeof TIPOS)[number];
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) especialidadeId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) modalidadeId!: string | null;
  @ApiProperty({ description: 'Nome da especialidade ou código da modalidade no catálogo.' })
  destinoNome!: string;
  @ApiProperty({ description: 'Nome da especialidade ou código da modalidade no catálogo.' })
  rotulo!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Do catálogo.' })
  descricao!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Do catálogo.' }) cor!: string | null;
  @ApiProperty({ description: 'Do catálogo.' }) ordem!: number;
  @ApiProperty({ description: 'Do catálogo: inativa lá, inativa na escala.' }) ativo!: boolean;
}

export class PaginaFrentesDto {
  @ApiProperty({ type: [FrenteItemDto] }) itens!: FrenteItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}
