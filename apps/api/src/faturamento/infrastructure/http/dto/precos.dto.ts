import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { aparar, PaginacaoDto } from '../../../../catalogo/comum/dto';
import { MENSAGEM_COMPETENCIA, PADRAO_COMPETENCIA } from './competencia.dto';

export const CONDS_VOLUME = ['MOD', 'MOD_ESP', 'MOD_ESP_CAT', 'TOTAL'] as const;
export const TIPOS_DONO = ['cliente', 'contratado'] as const;

function FaixaOpcional(descricao: string): PropertyDecorator {
  return (alvo, chave) => {
    ApiProperty({ type: 'integer', nullable: true, minimum: 0, description: descricao })(
      alvo,
      chave,
    );
    ValidateIf((_, v) => v !== null)(alvo, chave);
    IsInt()(alvo, chave);
    Min(0)(alvo, chave);
  };
}

function APartirDe(): PropertyDecorator {
  return (alvo, chave) => {
    ApiProperty({
      example: '2026-12',
      pattern: PADRAO_COMPETENCIA.source,
      description:
        'Competência a partir da qual a mudança vale: aberta ou futura, depois de toda fechada ou travada.',
    })(alvo, chave);
    Matches(PADRAO_COMPETENCIA, { message: `aPartirDe: ${MENSAGEM_COMPETENCIA}` })(alvo, chave);
  };
}

/** O arranjo de um preço. */
export class ArranjoPrecoDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() modalidadeId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() especialidadeId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() categoriaId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() prioridadeId!: string;
}

export class DadosPrecoDto extends ArranjoPrecoDto {
  @FaixaOpcional('Início da faixa de volume do mês; vazio = sem faixa.')
  faixaInicio!: number | null;

  @FaixaOpcional('Fim da faixa; vazio = sem limite.')
  faixaFim!: number | null;

  @ApiProperty({
    enum: CONDS_VOLUME,
    enumName: 'CondVolume',
    description: 'Em que dimensão o volume da faixa é somado (sem efeito sem faixa).',
  })
  @IsIn(CONDS_VOLUME)
  condVolume!: (typeof CONDS_VOLUME)[number];

  @ApiProperty({ example: 63.5, description: 'Maior que zero, até dois decimais.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valor!: number;
}

export class MudarPrecoDto extends DadosPrecoDto {
  @APartirDe() aPartirDe!: string;
}

export class EncerrarPrecoDto {
  @APartirDe() aPartirDe!: string;
}

export class ImportarPrecosDto {
  @ApiProperty({
    maxLength: 100_000,
    description: 'Planilha CSV (`;`) no modelo da exportação.',
  })
  @IsString()
  @MaxLength(100_000)
  conteudo!: string;

  @APartirDe() aPartirDe!: string;
}

export class ListarPrecosQueryDto extends PaginacaoDto {
  @ApiPropertyOptional({
    description: 'Parte do nome da modalidade, especialidade, categoria ou prioridade.',
  })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;
}

export class NomesArranjoDto {
  @ApiProperty() modalidade!: string;
  @ApiProperty() especialidade!: string;
  @ApiProperty() categoria!: string;
  @ApiProperty() prioridade!: string;
}

export class VersaoPrecoDto extends ArranjoPrecoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: 'integer', nullable: true }) faixaInicio!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) faixaFim!: number | null;
  @ApiProperty({ enum: CONDS_VOLUME, enumName: 'CondVolume' })
  condVolume!: (typeof CONDS_VOLUME)[number];
  @ApiProperty() valor!: number;
  @ApiProperty({ type: String, nullable: true, description: 'Vazio = desde sempre (carga).' })
  vigenciaDesde!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Vazio = sem fim.' })
  vigenciaAte!: string | null;
  @ApiProperty({ type: NomesArranjoDto }) nomes!: NomesArranjoDto;
}

export class ItemPrecoDto extends VersaoPrecoDto {
  @ApiProperty({ description: 'Outra versão do mesmo arranjo cruza a faixa e a vigência.' })
  duplicado!: boolean;
  @ApiProperty({ description: 'Vale no mês atual; as outras estão programadas.' })
  emVigor!: boolean;
}

export class PrincipalPrecoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}

export class DonoPrecoDto {
  @ApiProperty() nome!: string;
  @ApiProperty({
    type: PrincipalPrecoDto,
    nullable: true,
    description: 'Só na unidade: o principal, de onde vem o preço que faltar.',
  })
  principal!: PrincipalPrecoDto | null;
}

export class TabelaPrecosDto {
  @ApiProperty({ type: DonoPrecoDto }) dono!: DonoPrecoDto;
  @ApiProperty({ example: '2026-11' }) mesAtual!: string;
  @ApiProperty({ description: 'Primeira competência em que uma mudança pode valer.' })
  aPartirDeMinimo!: string;
  @ApiProperty({ description: 'A próxima competência (a sugerida no "Vale a partir de").' })
  aPartirDeSugerido!: string;
  @ApiProperty({ type: [ItemPrecoDto] }) itens!: ItemPrecoDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}

export class VersaoHistoricoDto extends VersaoPrecoDto {
  @ApiProperty({ type: String, nullable: true }) criadoPor!: string | null;
  @ApiProperty({ type: Date, nullable: true }) criadoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) encerradoPor!: string | null;
  @ApiProperty({ type: Date, nullable: true }) encerradoEm!: Date | null;
}

export class OpcaoPrecoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}

export class OpcaoContratadoPrecoDto extends OpcaoPrecoDto {
  @ApiProperty({ description: 'Vem escolhido no campo de contratado.' }) padrao!: boolean;
}

export class OpcoesPrecoDto {
  @ApiProperty({ type: [OpcaoPrecoDto] }) modalidades!: OpcaoPrecoDto[];
  @ApiProperty({ type: [OpcaoPrecoDto] }) especialidades!: OpcaoPrecoDto[];
  @ApiProperty({ type: [OpcaoPrecoDto] }) categorias!: OpcaoPrecoDto[];
  @ApiProperty({ type: [OpcaoPrecoDto] }) prioridades!: OpcaoPrecoDto[];
  @ApiProperty({ type: [OpcaoContratadoPrecoDto] }) contratados!: OpcaoContratadoPrecoDto[];
}

export class PlanilhaPrecosDto {
  @ApiProperty({ example: 'precos-CLINICA-2026-11.csv' }) nomeArquivo!: string;
  @ApiProperty({ description: 'CSV com `;`, BOM e vírgula decimal.' }) conteudo!: string;
}

export class ResultadoImportacaoPrecosDto {
  @ApiProperty() incluidos!: number;
  @ApiProperty() alterados!: number;
  @ApiProperty() iguais!: number;
}
