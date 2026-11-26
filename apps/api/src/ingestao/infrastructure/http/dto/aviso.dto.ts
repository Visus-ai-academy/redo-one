import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { aparar, booleanoDaQuery, PaginacaoDto } from '../../../../catalogo/comum/dto';
import { ORIGENS_AVISO, TIPOS_AVISO } from '../../../../comum/avisos/registro-avisos';
import {
  MENSAGEM_COMPETENCIA,
  PADRAO_COMPETENCIA,
} from '../../../../faturamento/infrastructure/http/dto/competencia.dto';
import { PessoaResumoDto } from './importacao.dto';

const TIPOS = TIPOS_AVISO;
const STATUS = ['pendente', 'resolvido', 'ignorado'] as const;

export class ListarAvisosDto extends PaginacaoDto {
  @ApiPropertyOptional({ enum: STATUS, enumName: 'StatusAviso' })
  @IsOptional()
  @IsIn(STATUS)
  status?: (typeof STATUS)[number];

  @ApiPropertyOptional({ enum: TIPOS, enumName: 'TipoAviso' })
  @IsOptional()
  @IsIn(TIPOS)
  tipo?: (typeof TIPOS)[number];

  @ApiPropertyOptional({
    description: 'Parte do texto do aviso (o nome como chegou) ou de um nome citado em lista.',
  })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;

  @ApiPropertyOptional({
    description: 'Só os tipos de que algum papel de quem consulta é responsável.',
  })
  @Transform(booleanoDaQuery)
  @IsOptional()
  @IsBoolean()
  meus?: boolean;

  @ApiPropertyOptional({ example: '2026-10', description: 'Só os ligados a esta competência.' })
  @IsOptional()
  @Matches(PADRAO_COMPETENCIA, { message: `competencia: ${MENSAGEM_COMPETENCIA}` })
  competencia?: string;

  @ApiPropertyOptional({
    description: 'Só os que se referem a este item (com `entidadeId`): cliente, medico, exame...',
  })
  @ValidateIf((o: ListarAvisosDto) => o.entidadeId !== undefined || o.entidade !== undefined)
  @IsString()
  @MaxLength(40)
  entidade?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((o: ListarAvisosDto) => o.entidadeId !== undefined || o.entidade !== undefined)
  @IsUUID()
  entidadeId?: string;
}

export class EntidadeAvisoDto {
  @ApiProperty({ description: 'Entidade no singular: cliente, medico, exame, preco_cliente...' })
  tipo!: string;
  @ApiProperty({ format: 'uuid' }) id!: string;
}

export class CompetenciasAvisoDto {
  @ApiProperty({ example: '2026-10' }) desde!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Vazio = dali em diante.' })
  ate!: string | null;
}

export class AvisoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: TIPOS, enumName: 'TipoAviso' }) tipo!: (typeof TIPOS)[number];
  @ApiProperty({ description: 'Como chegou na última verificação (importação, rodada, carga).' })
  valor!: string;
  @ApiProperty({
    type: [String],
    description: 'Nomes citados pelo aviso, para mostrar em lista (ex.: as tabelas de preço).',
  })
  itens!: string[];
  @ApiProperty({ enum: STATUS, enumName: 'StatusAviso' }) status!: (typeof STATUS)[number];
  @ApiProperty({ enum: ORIGENS_AVISO, enumName: 'OrigemAviso' })
  origem!: (typeof ORIGENS_AVISO)[number];
  @ApiProperty({
    type: CompetenciasAvisoDto,
    nullable: true,
    description: 'Competências a que se liga (a trava do fechamento).',
  })
  competencias!: CompetenciasAvisoDto | null;
  @ApiProperty({ type: [EntidadeAvisoDto], description: 'Itens a que se refere (selo e atalho).' })
  entidades!: EntidadeAvisoDto[];
  @ApiProperty({
    type: 'integer',
    description: 'Laudos da última importação (ou exames da última rodada) em que apareceu.',
  })
  ocorrencias!: number;
  @ApiProperty({ type: String, format: 'date-time' }) primeiraVezEm!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) ultimaVezEm!: Date;
  @ApiProperty({ type: PessoaResumoDto, nullable: true }) decididoPor!: PessoaResumoDto | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) decididoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) motivo!: string | null;
}

export class PaginaAvisosDto {
  @ApiProperty({ type: [AvisoDto] }) itens!: AvisoDto[];
  @ApiProperty({
    enum: TIPOS,
    enumName: 'TipoAviso',
    isArray: true,
    description: 'Tipos que o usuário vê (os da tela onde cada um se resolve): opções do filtro.',
  })
  tipos!: (typeof TIPOS)[number][];
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) pagina!: number;
  @ApiProperty({ type: 'integer' }) porPagina!: number;
}

export class ResumoAvisosDto {
  @ApiProperty({ type: 'integer', description: 'Pendentes dos tipos de que é responsável.' })
  total!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  maisAntigoEm!: Date | null;
  @ApiProperty({ enum: TIPOS, enumName: 'TipoAviso', isArray: true })
  tipos!: (typeof TIPOS)[number][];
}

export class SelosAvisoQueryDto {
  @ApiProperty({ description: 'Entidade dos itens: cliente, medico, exame, preco_cliente...' })
  @IsString()
  @MaxLength(40)
  entidade!: string;

  @ApiProperty({
    type: [String],
    description: 'Ids dos itens da página, separados por vírgula (até 200).',
  })
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : String(value ?? '').split(','))
      .map((v: unknown) => String(v).trim())
      .filter(Boolean),
  )
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class SeloAvisoDto {
  @ApiProperty({ format: 'uuid' }) entidadeId!: string;
  @ApiProperty({ format: 'uuid', description: 'O aviso.' }) id!: string;
  @ApiProperty({ enum: TIPOS, enumName: 'TipoAviso' }) tipo!: (typeof TIPOS)[number];
  @ApiProperty() valor!: string;
}

export class PapelResponsavelDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}

export class ConfiguracaoTipoAvisoDto {
  @ApiProperty({ enum: TIPOS, enumName: 'TipoAviso' }) tipo!: (typeof TIPOS)[number];
  @ApiProperty({ description: 'Aviso pendente ligado à competência impede fechá-la.' })
  impedeFecharCompetencia!: boolean;
  @ApiProperty({ type: [PapelResponsavelDto] }) responsaveis!: PapelResponsavelDto[];
  @ApiProperty({ type: 'integer', description: 'Pendentes agora.' }) pendentes!: number;
}

export class TiposAvisoDto {
  @ApiProperty({ type: [ConfiguracaoTipoAvisoDto] }) tipos!: ConfiguracaoTipoAvisoDto[];
  @ApiProperty({ type: [PapelResponsavelDto], description: 'Papéis que se pode escolher.' })
  papeis!: PapelResponsavelDto[];
}

export class TipoAvisoParamDto {
  @ApiProperty({ enum: TIPOS, enumName: 'TipoAviso' })
  @IsIn(TIPOS)
  tipo!: (typeof TIPOS)[number];
}

export class AtualizarTipoAvisoDto {
  @ApiProperty() @IsBoolean() impedeFecharCompetencia!: boolean;

  @ApiProperty({ type: [String], format: 'uuid', maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  papeisIds!: string[];
}

export class IgnorarAvisoDto {
  @ApiProperty({ maxLength: 300, example: 'Cliente de teste da MobileMed.' })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty({ message: 'Informe o motivo.' })
  @MaxLength(300)
  motivo!: string;
}

export class ParametrosIngestaoDto {
  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description: 'Trava contra arquivo truncado: recusa se sumiriam mais laudos que isto...',
  })
  @IsInt()
  @Min(0)
  travaRemocaoMinimo!: number;

  @ApiProperty({ minimum: 0, description: '...e mais que este múltiplo das linhas do arquivo.' })
  @IsNumber()
  @Min(0.01)
  @Max(1000)
  travaRemocaoFator!: number;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: 3650,
    description: 'Dias que a linha crua fica guardada.',
  })
  @IsInt()
  @Min(1)
  @Max(3650)
  retencaoLinhasBrutasDias!: number;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    minimum: 5,
    maximum: 1440,
    description: 'Minutos entre duas importações automáticas da MobileMed; vazio = desligada.',
  })
  // Nulo desliga; ausente é recusado (um PUT sem o campo não pode desligar por engano).
  @ValidateIf((_, valor) => valor !== null)
  @IsInt()
  @Min(5)
  @Max(1440)
  mobilemedIntervaloMinutos!: number | null;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    maximum: 12,
    description: 'O período começa no dia 1º de tantos meses atrás (1 = do mês anterior até hoje).',
  })
  @IsInt()
  @Min(0)
  @Max(12)
  mobilemedMesesAnteriores!: number;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: 31,
    description: 'Dias de cada chamada ao relatório da MobileMed (a que vier no teto é dividida).',
  })
  @IsInt()
  @Min(1)
  @Max(31)
  mobilemedJanelaDias!: number;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: 1_000_000,
    description:
      'Limite de itens por chamada da MobileMed (hoje 50.000); resposta no teto é refeita.',
  })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  mobilemedTeto!: number;

  @ApiProperty({
    type: [String],
    maxItems: 20,
    description:
      'Unidades de destino cujo compartilhamento a importação da MobileMed traz (vazia: nenhum).',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  mobilemedCompartilhamentoUnidades!: string[];
}
