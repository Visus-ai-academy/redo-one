import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

/** "YYYY-MM" com mês de 01 a 12. */
export const PADRAO_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
export const MENSAGEM_COMPETENCIA = 'Use o formato AAAA-MM, com o mês de 01 a 12.';

export class CompetenciaParamDto {
  @ApiProperty({ example: '2026-10', pattern: PADRAO_COMPETENCIA.source })
  @Matches(PADRAO_COMPETENCIA, { message: `competencia: ${MENSAGEM_COMPETENCIA}` })
  competencia!: string;
}

export class CompetenciaDto {
  @ApiProperty({ example: '2026-10', description: 'Mês de faturamento (AAAA-MM).' })
  competencia!: string;
  @ApiProperty({ enum: ['aberta', 'fechada'], enumName: 'StatusCompetencia' })
  status!: 'aberta' | 'fechada';
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fechada em.' })
  fechadaEm!: Date | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Quem fechou: nome do usuário ou, na migração, o texto do dashboards-one.',
  })
  fechadaPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Reaberta em.' })
  reabertaEm!: Date | null;
  @ApiProperty({ type: String, nullable: true, description: 'Quem reabriu (nome ou texto).' })
  reabertaPor!: string | null;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Importação travada em; vazio = destravada.',
  })
  importacaoTravadaEm!: Date | null;
  @ApiProperty({ type: String, nullable: true, description: 'Quem travou (nome ou texto).' })
  importacaoTravadaPor!: string | null;
  @ApiProperty({ type: String, nullable: true }) observacoes!: string | null;
  @ApiProperty({ type: 'integer', description: 'Laudos (não removidos) desta competência.' })
  laudos!: number;
  @ApiProperty({ type: Number, description: 'Soma do volume desses laudos.' })
  volume!: number;
}

export class PaginaCompetenciasDto {
  @ApiProperty({ type: [CompetenciaDto] }) itens!: CompetenciaDto[];
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) pagina!: number;
  @ApiProperty({ type: 'integer' }) porPagina!: number;
}
