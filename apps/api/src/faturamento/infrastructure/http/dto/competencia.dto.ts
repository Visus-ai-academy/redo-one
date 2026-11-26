import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { aparar } from '../../../../catalogo/comum/dto';
import { CONTEXTOS_RECALCULO, type ContextoRecalculo } from '../../../domain/recalculo-competencia';

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
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Fechada apesar de avisos pendentes que impediam: o motivo de quem fechou.',
  })
  fechadaComAvisosMotivo!: string | null;
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

export class FecharCompetenciaDto {
  @ApiPropertyOptional({
    maxLength: 500,
    description:
      'Fechar apesar de avisos pendentes que impedem (exige faturamento.competencia.fechar_com_avisos).',
  })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivoAvisos?: string;
}

export class AvisoQueImpedeFecharDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'Tipo do aviso (o mesmo de Operação › Avisos).' }) tipo!: string;
  @ApiProperty() valor!: string;
}

export class AvisosQueImpedemFecharDto {
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: [AvisoQueImpedeFecharDto], description: 'Os mais antigos (até 20).' })
  itens!: AvisoQueImpedeFecharDto[];
}

/** O 409 de fechar com avisos pendentes que impedem. */
export class FechamentoComAvisosDto {
  @ApiProperty({ type: 'integer', example: 409 }) statusCode!: number;
  @ApiProperty() message!: string;
  @ApiProperty({ enum: ['avisos_pendentes'] }) codigo!: 'avisos_pendentes';
  @ApiProperty({ type: AvisosQueImpedemFecharDto }) avisos!: AvisosQueImpedemFecharDto;
  @ApiProperty({ description: 'Quem pediu pode fechar mesmo assim, informando o motivo.' })
  podeFecharComAvisos!: boolean;
}

export class RecalcularCompetenciaDto {
  @ApiProperty({
    maxLength: 1000,
    description: 'Por que a competência fechada é recalculada (obrigatório; fica no histórico).',
  })
  @Transform(aparar)
  @IsString()
  @MaxLength(1000)
  motivo!: string;
}

export class RecalculoCriadoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}

export class RecalculoCompetenciaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '2026-10' }) competencia!: string;
  @ApiProperty({ enum: CONTEXTOS_RECALCULO, enumName: 'ContextoRecalculo' })
  contexto!: ContextoRecalculo;
  @ApiProperty() motivo!: string;
  @ApiProperty({ format: 'uuid' }) solicitadoPorId!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Nome de quem pediu.' })
  solicitadoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) solicitadoEm!: Date;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Quando o resultado novo ficou gravado; vazio = na fila ou rodando.',
  })
  concluidoEm!: Date | null;
}
