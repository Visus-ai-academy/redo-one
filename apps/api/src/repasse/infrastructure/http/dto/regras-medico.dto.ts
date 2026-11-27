import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { aparar } from '../../../../catalogo/comum/dto';
import { AdicionalDto } from './repasse.dto';

const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
const APartir = () => Matches(COMPETENCIA, { message: 'aPartirDe: use o formato AAAA-MM.' });

export const MODOS_CONTAGEM = ['todos_os_laudos', 'recortes', 'somente_adicionais'] as const;
export const TIPOS_REGRA_APURACAO = [
  'fixo',
  'por_laudo',
  'percentual_repasse',
  'tarifa_laudo',
] as const;

export class MedicoVersaoParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() medicoId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() id!: string;
}

/** Recorte cliente × especialidade, com "todos" explícito em cada lado. */
export class RecorteContagemDto {
  @ApiProperty() @IsBoolean() todosClientes!: boolean;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @ValidateIf((o: RecorteContagemDto) => !o.todosClientes)
  @IsUUID()
  clienteId!: string | null;
  @ApiProperty() @IsBoolean() todasEspecialidades!: boolean;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @ValidateIf((o: RecorteContagemDto) => !o.todasEspecialidades)
  @IsUUID()
  especialidadeId!: string | null;
}

export class NovaVersaoContagemDto {
  @ApiProperty({ example: '2026-12' }) @APartir() aPartirDe!: string;
  @ApiProperty({ enum: MODOS_CONTAGEM, enumName: 'ModoContagemRepasse' })
  @IsIn(MODOS_CONTAGEM)
  modo!: (typeof MODOS_CONTAGEM)[number];
  @ApiProperty({ type: [RecorteContagemDto], description: 'Só no modo `recortes`.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecorteContagemDto)
  recortes!: RecorteContagemDto[];
}

class AutoriaDto {
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) criadoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) criadoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) encerradoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) encerradoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) reabertoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) reabertoPor!: string | null;
}

export class RecorteContagemLidoDto {
  @ApiProperty({ type: String, nullable: true, description: 'Nulo = todos os clientes.' })
  clienteId!: string | null;
  @ApiProperty({ type: String, nullable: true }) cliente!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Nulo = todas.' })
  especialidadeId!: string | null;
  @ApiProperty({ type: String, nullable: true }) especialidade!: string | null;
}

export class VersaoContagemDto extends AutoriaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: MODOS_CONTAGEM, enumName: 'ModoContagemRepasse' })
  modo!: (typeof MODOS_CONTAGEM)[number];
  @ApiProperty({ type: [RecorteContagemLidoDto] }) recortes!: RecorteContagemLidoDto[];
  @ApiProperty({ type: String, nullable: true }) vigenciaDesde!: string | null;
  @ApiProperty({ type: String, nullable: true }) vigenciaAte!: string | null;
}

class VigenciaDaTelaDto {
  @ApiProperty({ example: '2026-11' }) mesAtual!: string;
  @ApiProperty() aPartirDeMinimo!: string;
  @ApiProperty() aPartirDeSugerido!: string;
}

export class ContagemMedicoDto extends VigenciaDaTelaDto {
  @ApiProperty({
    type: [VersaoContagemDto],
    description: 'Mais nova primeiro. Sem versão: todos os laudos contam.',
  })
  versoes!: VersaoContagemDto[];
}

/** Recorte com "Todas" explícito. */
class RecorteIdsDto {
  @ApiProperty() @IsBoolean() todas!: boolean;
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class DadosRegraApuracaoDto {
  @ApiProperty({ example: '2026-12' }) @APartir() aPartirDe!: string;
  @ApiProperty({ enum: TIPOS_REGRA_APURACAO, enumName: 'TipoRegraApuracao' })
  @IsIn(TIPOS_REGRA_APURACAO)
  tipo!: (typeof TIPOS_REGRA_APURACAO)[number];
  @ApiProperty({ maxLength: 300 })
  @Transform(aparar)
  @IsString()
  @MaxLength(300)
  descricao!: string;
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Fixo, por laudo e tarifa própria: centavos.',
  })
  @IsOptional()
  @IsInt()
  valorCentavos!: number | null;
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Percentual do repasse, em partes por milhão (6% = 60000).',
  })
  @IsOptional()
  @IsInt()
  percentualPpm!: number | null;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  divisor!: number;
  @ApiProperty({ type: RecorteIdsDto })
  @ValidateNested()
  @Type(() => RecorteIdsDto)
  modalidades!: RecorteIdsDto;
  @ApiProperty({ type: RecorteIdsDto })
  @ValidateNested()
  @Type(() => RecorteIdsDto)
  especialidades!: RecorteIdsDto;
  @ApiProperty({ type: RecorteIdsDto })
  @ValidateNested()
  @Type(() => RecorteIdsDto)
  prioridades!: RecorteIdsDto;
}

export class EncerrarVersaoDto {
  @ApiProperty({ example: '2026-12' }) @APartir() aPartirDe!: string;
}

class NomesRegraDto {
  @ApiProperty({ type: [String] }) modalidades!: string[];
  @ApiProperty({ type: [String] }) especialidades!: string[];
  @ApiProperty({ type: [String] }) prioridades!: string[];
}

export class RegraApuracaoDto extends AutoriaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: TIPOS_REGRA_APURACAO, enumName: 'TipoRegraApuracao' })
  tipo!: (typeof TIPOS_REGRA_APURACAO)[number];
  @ApiProperty() descricao!: string;
  @ApiProperty({ type: 'integer', nullable: true }) valorCentavos!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) percentualPpm!: number | null;
  @ApiProperty({ type: 'integer' }) divisor!: number;
  @ApiProperty({ type: [String], nullable: true, description: 'Nulo = todas.' })
  modalidadeIds!: string[] | null;
  @ApiProperty({ type: [String], nullable: true }) especialidadeIds!: string[] | null;
  @ApiProperty({ type: [String], nullable: true }) prioridadeIds!: string[] | null;
  @ApiProperty({ type: NomesRegraDto }) nomes!: NomesRegraDto;
  @ApiProperty({ type: String, nullable: true }) vigenciaDesde!: string | null;
  @ApiProperty({ type: String, nullable: true }) vigenciaAte!: string | null;
}

export class RegrasApuracaoMedicoDto extends VigenciaDaTelaDto {
  @ApiProperty({ type: [RegraApuracaoDto], description: 'Todas as versões.' })
  regras!: RegraApuracaoDto[];
}

export class PaginaAdicionaisMedicoDto {
  @ApiProperty({ type: [AdicionalDto] }) itens!: AdicionalDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}
