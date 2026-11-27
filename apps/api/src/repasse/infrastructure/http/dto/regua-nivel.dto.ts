import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { aparar, PaginacaoDto } from '../../../../catalogo/comum/dto';
import { RegraApuracaoDto, TIPOS_REGRA_APURACAO } from './regras-medico.dto';

const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
const APartir = () => Matches(COMPETENCIA, { message: 'aPartirDe: use o formato AAAA-MM.' });

export class NivelParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() nivelId!: string;
}

export class LinhaReguaParamDto extends NivelParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id!: string;
}

export class IncluirLinhaReguaDto {
  @ApiProperty({ example: '2026-12' }) @APartir() aPartirDe!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() modalidadeId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() especialidadeId!: string;
  @ApiProperty({ description: 'Vale para todas as categorias (explícito).' })
  @IsBoolean()
  todasCategorias!: boolean;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @ValidateIf((o: IncluirLinhaReguaDto) => !o.todasCategorias)
  @IsUUID()
  categoriaId!: string | null;
  @ApiProperty({ description: 'Vale para todas as prioridades (explícito).' })
  @IsBoolean()
  todasPrioridades!: boolean;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @ValidateIf((o: IncluirLinhaReguaDto) => !o.todasPrioridades)
  @IsUUID()
  prioridadeId!: string | null;
  @ApiProperty({ type: 'integer', description: 'Centavos, maior que zero.' })
  @IsInt()
  @Min(1)
  valorCentavos!: number;
}

export class AlterarLinhaReguaDto {
  @ApiProperty({ example: '2026-12' }) @APartir() aPartirDe!: string;
  @ApiProperty({ type: 'integer', description: 'Centavos, maior que zero.' })
  @IsInt()
  @Min(1)
  valorCentavos!: number;
}

export class EncerrarLinhaReguaDto {
  @ApiProperty({ example: '2026-12' }) @APartir() aPartirDe!: string;
}

class NomesLinhaReguaDto {
  @ApiProperty() modalidade!: string;
  @ApiProperty() especialidade!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Nulo = todas as categorias.' })
  categoria!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Nulo = todas as prioridades.' })
  prioridade!: string | null;
}

export class LinhaReguaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) nivelId!: string;
  @ApiProperty({ format: 'uuid' }) modalidadeId!: string;
  @ApiProperty({ format: 'uuid' }) especialidadeId!: string;
  @ApiProperty({ type: String, nullable: true }) categoriaId!: string | null;
  @ApiProperty({ type: String, nullable: true }) prioridadeId!: string | null;
  @ApiProperty({ type: 'integer' }) valorCentavos!: number;
  @ApiProperty({ type: String, nullable: true }) vigenciaDesde!: string | null;
  @ApiProperty({ type: String, nullable: true }) vigenciaAte!: string | null;
  @ApiProperty({ type: NomesLinhaReguaDto }) nomes!: NomesLinhaReguaDto;
  @ApiProperty({ type: String, nullable: true }) criadoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) criadoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) encerradoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) encerradoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) reabertoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) reabertoEm!: Date | null;
}

export class ReguaNivelDto {
  @ApiProperty({ example: '2026-11' }) mesAtual!: string;
  @ApiProperty() aPartirDeMinimo!: string;
  @ApiProperty() aPartirDeSugerido!: string;
  @ApiProperty({ type: [LinhaReguaDto], description: 'Todas as versões das linhas.' })
  linhas!: LinhaReguaDto[];
}

export class PreencherPelaReguaDto {
  @ApiProperty({ example: '2026-12' }) @APartir() aPartirDe!: string;
  @ApiProperty({ description: 'Falso: só a prévia. Verdadeiro: grava as versões.' })
  @IsBoolean()
  confirmar!: boolean;
}

export const ACOES_PREENCHIMENTO = ['incluir', 'alterar', 'igual', 'programado'] as const;

class NomesArranjoPreenchimentoDto {
  @ApiProperty() modalidade!: string;
  @ApiProperty() especialidade!: string;
  @ApiProperty() categoria!: string;
  @ApiProperty() prioridade!: string;
}

export class ItemPreenchimentoDto {
  @ApiProperty({ format: 'uuid' }) modalidadeId!: string;
  @ApiProperty({ format: 'uuid' }) especialidadeId!: string;
  @ApiProperty({ format: 'uuid' }) categoriaId!: string;
  @ApiProperty({ format: 'uuid' }) prioridadeId!: string;
  @ApiProperty({ type: 'integer', nullable: true }) atualCentavos!: number | null;
  @ApiProperty({ type: 'integer' }) novoCentavos!: number;
  @ApiProperty({ enum: ACOES_PREENCHIMENTO, enumName: 'AcaoPreenchimentoRegua' })
  acao!: (typeof ACOES_PREENCHIMENTO)[number];
  @ApiProperty({ type: NomesArranjoPreenchimentoDto }) nomes!: NomesArranjoPreenchimentoDto;
}

export class PreviaPreenchimentoDto {
  @ApiProperty() nivel!: string;
  @ApiProperty() aPartirDe!: string;
  @ApiProperty({ type: [ItemPreenchimentoDto] }) itens!: ItemPreenchimentoDto[];
}

export class ListarRegrasGeralQueryDto extends PaginacaoDto {
  @ApiPropertyOptional({ description: 'Parte do nome do médico ou da descrição da regra.' })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;

  @ApiPropertyOptional({
    enum: TIPOS_REGRA_APURACAO,
    enumName: 'TipoRegraApuracao',
    description: 'Sem ele, todos os tipos (a tela escolhe "Todos").',
  })
  @IsOptional()
  @IsIn(TIPOS_REGRA_APURACAO)
  tipo?: (typeof TIPOS_REGRA_APURACAO)[number];
}

export class RegraApuracaoGeralDto extends RegraApuracaoDto {
  @ApiProperty({ format: 'uuid' }) medicoId!: string;
  @ApiProperty() medico!: string;
}

export class PaginaRegrasApuracaoGeralDto {
  @ApiProperty({ example: '2026-11' }) mesAtual!: string;
  @ApiProperty({ type: [RegraApuracaoGeralDto] }) itens!: RegraApuracaoGeralDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}
