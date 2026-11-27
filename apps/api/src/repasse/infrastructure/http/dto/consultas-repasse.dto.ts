import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

import { aparar, PaginacaoDto } from '../../../../catalogo/comum/dto';
import {
  ORDENS_DEMONSTRATIVO,
  type OrdemDemonstrativo,
  SITUACOES_DEMONSTRATIVO,
  type SituacaoDemonstrativo,
} from '../../../application/ports/consultas-repasse';
import { AdicionalDto } from './repasse.dto';

const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
const MSG = 'Use o formato AAAA-MM, com o mês de 01 a 12.';
const TIPOS_ADICIONAL = ['avulso', 'peer_review', 'plantao'] as const;
const ORIGENS = ['unidade', 'cliente', 'todos', 'tarifa_propria', 'sem_preco'] as const;

export class CompetenciaComRepasseDto {
  @ApiProperty({ example: '2026-11' }) competencia!: string;
  @ApiProperty({ enum: ['aberta', 'fechada'] }) status!: 'aberta' | 'fechada';
}

export class TotaisRepasseDto {
  @ApiProperty({ type: 'integer' }) medicos!: number;
  @ApiProperty({ description: 'Soma do volume dos laudos pagos.' }) volume!: number;
  @ApiProperty({ type: 'integer' }) examesCentavos!: number;
  @ApiProperty({ type: 'integer' }) adicionaisCentavos!: number;
  @ApiProperty({ type: 'integer' }) brutoCentavos!: number;
  @ApiProperty({ type: 'integer' }) retencoesCentavos!: number;
  @ApiProperty({ type: 'integer' }) liquidoCentavos!: number;
  @ApiProperty({ type: 'integer', description: 'Grupos (médico × arranjo × cliente) sem preço.' })
  gruposSemPreco!: number;
  @ApiProperty({ type: 'integer', description: 'Laudos desses grupos, pagos a zero.' })
  laudosSemPreco!: number;
}

export class PedidoRecalculoLidoDto {
  @ApiProperty() motivo!: string;
  @ApiProperty({ type: String, nullable: true }) solicitadoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) solicitadoEm!: Date;
}

export class VersaoRepasseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: 'integer', description: '1 = a primeira geração guardada.' })
  numero!: number;
  @ApiProperty({ enum: ['previa', 'recalculo'] }) tipo!: 'previa' | 'recalculo';
  @ApiProperty() atual!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) geradoEm!: Date;
  @ApiProperty({ type: PedidoRecalculoLidoDto, nullable: true })
  recalculo!: PedidoRecalculoLidoDto | null;
  @ApiProperty({ type: TotaisRepasseDto }) totais!: TotaisRepasseDto;
}

export class CompetenciaRepasseDto {
  @ApiProperty() competencia!: string;
  @ApiProperty({ enum: ['aberta', 'fechada'] }) status!: 'aberta' | 'fechada';
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) fechadaEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) fechadaPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) reabertaEm!: Date | null;
  @ApiProperty({ type: [VersaoRepasseDto], description: 'A mais antiga primeiro.' })
  versoes!: VersaoRepasseDto[];
  @ApiProperty({ type: VersaoRepasseDto, nullable: true }) atual!: VersaoRepasseDto | null;
  @ApiProperty({
    type: PedidoRecalculoLidoDto,
    nullable: true,
    description: 'Recálculo pedido e ainda em andamento.',
  })
  recalculoPendente!: PedidoRecalculoLidoDto | null;
}

export class ListarDemonstrativosDto extends PaginacaoDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Geração; sem ela, a atual.' })
  @IsOptional()
  @IsUUID()
  versao?: string;

  @ApiPropertyOptional({ description: 'Parte do nome do médico.' })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;

  @ApiPropertyOptional({ enum: SITUACOES_DEMONSTRATIVO, default: 'todas' })
  @IsOptional()
  @IsIn(SITUACOES_DEMONSTRATIVO)
  situacao: SituacaoDemonstrativo = 'todas';

  @ApiPropertyOptional({ enum: ORDENS_DEMONSTRATIVO, default: 'medico' })
  @IsOptional()
  @IsIn(ORDENS_DEMONSTRATIVO)
  ordem: OrdemDemonstrativo = 'medico';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  direcao: 'asc' | 'desc' = 'asc';
}

export class DemonstrativoResumoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) medicoId!: string;
  @ApiProperty() medico!: string;
  @ApiProperty() volume!: number;
  @ApiProperty({ type: 'integer' }) examesCentavos!: number;
  @ApiProperty({ type: 'integer' }) adicionaisCentavos!: number;
  @ApiProperty({ type: 'integer' }) brutoCentavos!: number;
  @ApiProperty({ type: 'integer' }) retencoesCentavos!: number;
  @ApiProperty({ type: 'integer' }) liquidoCentavos!: number;
  @ApiProperty({ type: 'integer' }) gruposSemPreco!: number;
}

export class PaginaDemonstrativosRepasseDto {
  @ApiProperty({ type: [DemonstrativoResumoDto] }) itens!: DemonstrativoResumoDto[];
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) pagina!: number;
  @ApiProperty({ type: 'integer' }) porPagina!: number;
  @ApiProperty({ type: TotaisRepasseDto, description: 'Somas do recorte filtrado.' })
  totais!: TotaisRepasseDto;
}

export class GrupoRepasseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) modalidade!: string | null;
  @ApiProperty({ type: String, nullable: true }) especialidade!: string | null;
  @ApiProperty({ type: String, nullable: true }) categoria!: string | null;
  @ApiProperty({ type: String, nullable: true }) prioridade!: string | null;
  @ApiProperty({ type: String, nullable: true }) cliente!: string | null;
  @ApiProperty({ type: String, nullable: true }) unidade!: string | null;
  @ApiProperty() volume!: number;
  @ApiProperty({ type: 'integer', nullable: true }) unitarioCentavos!: number | null;
  @ApiProperty({ type: 'integer' }) totalCentavos!: number;
  @ApiProperty({ enum: ORIGENS, enumName: 'OrigemPrecoRepasse' })
  origem!: (typeof ORIGENS)[number];
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Categoria do preço quando veio por uma alternativa.',
  })
  categoriaPreco!: string | null;
}

export class LancamentoRepasseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['adicional', 'regra', 'retencao'] })
  tipo!: 'adicional' | 'regra' | 'retencao';
  @ApiProperty() descricao!: string;
  @ApiProperty({ type: 'integer' }) totalCentavos!: number;
}

export class DiaRepasseDto {
  @ApiProperty({ example: '2026-11-03' }) dia!: string;
  @ApiProperty() volume!: number;
  @ApiProperty({ type: 'integer' }) totalCentavos!: number;
}

export class DemonstrativoDetalheDto extends DemonstrativoResumoDto {
  @ApiProperty() competencia!: string;
  @ApiProperty({ format: 'uuid' }) geracaoId!: string;
  @ApiProperty({ type: 'integer' }) versao!: number;
  @ApiProperty() versaoAtual!: boolean;
  @ApiProperty({ type: String, nullable: true }) contratado!: string | null;
  @ApiProperty({ type: [GrupoRepasseDto] }) grupos!: GrupoRepasseDto[];
  @ApiProperty({ type: [LancamentoRepasseDto] }) lancamentos!: LancamentoRepasseDto[];
  @ApiProperty({ type: [DiaRepasseDto] }) dias!: DiaRepasseDto[];
}

export class LaudoDemonstrativoDto {
  @ApiProperty({ format: 'uuid' }) laudoId!: string;
  @ApiProperty({ type: 'integer', description: '0 = o laudo inteiro; 1..N = a peça da quebra.' })
  peca!: number;
  @ApiProperty({ type: String, format: 'date-time' }) dataLaudo!: Date;
  @ApiProperty({ type: String, nullable: true }) exame!: string | null;
  @ApiProperty({ type: String, nullable: true }) cliente!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Só com a permissão.' })
  paciente!: string | null;
  @ApiProperty() volume!: number;
  @ApiProperty({ type: 'integer' }) totalCentavos!: number;
}

export class PaginaLaudosDemonstrativoDto {
  @ApiProperty({ type: [LaudoDemonstrativoDto] }) itens!: LaudoDemonstrativoDto[];
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) pagina!: number;
  @ApiProperty({ type: 'integer' }) porPagina!: number;
  @ApiProperty({ description: 'O nome do paciente veio (quem pede tem a permissão).' })
  pacienteVisivel!: boolean;
}

export class ListarAdicionaisDto extends PaginacaoDto {
  @ApiProperty({ example: '2026-11', pattern: COMPETENCIA.source })
  @Matches(COMPETENCIA, { message: `competencia: ${MSG}` })
  competencia!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Sem ele: todos os médicos.' })
  @IsOptional()
  @IsUUID()
  medicoId?: string;

  @ApiPropertyOptional({
    enum: TIPOS_ADICIONAL,
    enumName: 'TipoAdicionalRepasse',
    description: 'Sem ele: todos os tipos.',
  })
  @IsOptional()
  @IsIn(TIPOS_ADICIONAL)
  tipo?: (typeof TIPOS_ADICIONAL)[number];
}

export class TarifasDto {
  @ApiProperty({ type: 'integer' }) peerReviewCentavos!: number;
  @ApiProperty({ type: 'integer' }) plantaoCentavos!: number;
}

export class TarifasLancamentoDto {
  @ApiProperty() competencia!: string;
  @ApiProperty() fechada!: boolean;
  @ApiProperty({ description: 'Onde o adicional entra por padrão (a próxima aberta, se fechada).' })
  destino!: string;
  @ApiProperty({ type: TarifasDto }) tarifasDestino!: TarifasDto;
  @ApiProperty({ type: TarifasDto, description: 'Para lançar na própria fechada.' })
  tarifasDaCompetencia!: TarifasDto;
}

export class BuscarMedicosRepasseDto {
  @ApiPropertyOptional({ description: 'Parte do nome.' })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;
}

export class MedicoOpcaoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}

export class PaginaAdicionaisDto {
  @ApiProperty({ type: [AdicionalDto] }) itens!: AdicionalDto[];
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) pagina!: number;
  @ApiProperty({ type: 'integer' }) porPagina!: number;
}
