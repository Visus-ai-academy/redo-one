import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { aparar, PaginacaoDto } from '../../../../catalogo/comum/dto';
import { APartirDeDto } from './repasse.dto';

const booleano = ({ value }: { value: unknown }) =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : value;

export class MedicoParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() medicoId!: string;
}

export class PrecoRepasseParamDto extends MedicoParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() precoId!: string;
}

export class ArranjoPrecoRepasseDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() modalidadeId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() especialidadeId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() categoriaId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() prioridadeId!: string;
}

/** O cliente do preço com "todos" explícito: `todosClientes` ou um `clienteId`. */
export class HistoricoPrecoRepasseQueryDto extends ArranjoPrecoRepasseDto {
  @ApiProperty({ description: 'O preço vale para todos os clientes.' })
  @Transform(booleano)
  @IsBoolean()
  todosClientes!: boolean;

  @ApiPropertyOptional({ format: 'uuid', description: 'Sem `todosClientes`: o cliente.' })
  @ValidateIf((o: HistoricoPrecoRepasseQueryDto) => !o.todosClientes)
  @IsUUID()
  clienteId?: string;
}

export class MudarPrecoRepasseDto extends ArranjoPrecoRepasseDto {
  @ApiProperty({ description: 'Vale para todos os clientes (explícito).' })
  @IsBoolean()
  todosClientes!: boolean;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Obrigatório sem `todosClientes`; vazio com ele.',
  })
  @ValidateIf((o: MudarPrecoRepasseDto) => !o.todosClientes)
  @IsUUID()
  clienteId!: string | null;

  @ApiProperty({ example: 32.07, description: 'Em reais: maior que zero, até dois decimais.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valor!: number;

  @ApiProperty({ example: '2026-12', description: 'Vale a partir de (aberta ou futura).' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'aPartirDe: use o formato AAAA-MM.' })
  aPartirDe!: string;
}

export class EncerrarPrecoRepasseDto extends APartirDeDto {}

export class ImportarPrecosRepasseDto extends APartirDeDto {
  @ApiProperty({ maxLength: 200_000, description: 'Planilha CSV (`;`) no modelo da exportação.' })
  @IsString()
  @MaxLength(200_000)
  conteudo!: string;
}

export class ListarPrecosRepasseQueryDto extends PaginacaoDto {
  @ApiPropertyOptional({ description: 'Parte do nome do arranjo ou do cliente.' })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Com os outros três: só este arranjo.' })
  @IsOptional()
  @IsUUID()
  modalidadeId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() especialidadeId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() categoriaId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() prioridadeId?: string;
}

export class NomesPrecoRepasseDto {
  @ApiProperty() modalidade!: string;
  @ApiProperty() especialidade!: string;
  @ApiProperty() categoria!: string;
  @ApiProperty() prioridade!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Vazio = todos os clientes.' })
  cliente!: string | null;
}

export class VersaoPrecoRepasseDto extends ArranjoPrecoRepasseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() todosClientes!: boolean;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) clienteId!: string | null;
  @ApiProperty({ description: 'Em reais.' }) valor!: number;
  @ApiProperty({ type: String, nullable: true, description: 'Vazio = desde sempre (carga).' })
  vigenciaDesde!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Vazio = sem fim.' })
  vigenciaAte!: string | null;
  @ApiProperty({ type: NomesPrecoRepasseDto }) nomes!: NomesPrecoRepasseDto;
}

export class ItemPrecoRepasseDto extends VersaoPrecoRepasseDto {
  @ApiProperty({ description: 'Outra versão do mesmo arranjo e cliente cruza a vigência.' })
  duplicado!: boolean;
  @ApiProperty({ description: 'Vale no mês atual; as outras estão programadas.' })
  emVigor!: boolean;
}

export class MedicoPrecoRepasseDto {
  @ApiProperty() nome!: string;
}

export class TabelaPrecosRepasseDto {
  @ApiProperty({ type: MedicoPrecoRepasseDto }) medico!: MedicoPrecoRepasseDto;
  @ApiProperty({ example: '2026-11' }) mesAtual!: string;
  @ApiProperty() aPartirDeMinimo!: string;
  @ApiProperty() aPartirDeSugerido!: string;
  @ApiProperty({ type: [ItemPrecoRepasseDto] }) itens!: ItemPrecoRepasseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}

export class VersaoHistoricoPrecoRepasseDto extends VersaoPrecoRepasseDto {
  @ApiProperty({ type: String, nullable: true }) criadoPor!: string | null;
  @ApiProperty({ type: Date, nullable: true }) criadoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) encerradoPor!: string | null;
  @ApiProperty({ type: Date, nullable: true }) encerradoEm!: Date | null;
}

export class OpcaoRepasseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}

export class OpcoesPrecoRepasseDto {
  @ApiProperty({ type: [OpcaoRepasseDto] }) modalidades!: OpcaoRepasseDto[];
  @ApiProperty({ type: [OpcaoRepasseDto] }) especialidades!: OpcaoRepasseDto[];
  @ApiProperty({ type: [OpcaoRepasseDto] }) categorias!: OpcaoRepasseDto[];
  @ApiProperty({ type: [OpcaoRepasseDto] }) prioridades!: OpcaoRepasseDto[];
  @ApiProperty({ type: [OpcaoRepasseDto], description: 'Clientes ativos (nome na MobileMed).' })
  clientes!: OpcaoRepasseDto[];
}

export class PlanilhaPrecosRepasseDto {
  @ApiProperty() nomeArquivo!: string;
  @ApiProperty({ description: 'CSV com `;`, BOM e vírgula decimal.' }) conteudo!: string;
}

export class ResultadoImportacaoPrecosRepasseDto {
  @ApiProperty() incluidos!: number;
  @ApiProperty() alterados!: number;
  @ApiProperty() iguais!: number;
}
