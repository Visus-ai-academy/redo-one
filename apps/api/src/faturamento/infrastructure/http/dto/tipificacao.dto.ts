import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { MENSAGEM_COMPETENCIA, PADRAO_COMPETENCIA } from './competencia.dto';

const TIPOS = ['modalidade', 'especialidade', 'prioridade'] as const;
const MODOS = ['todos', 'apenas', 'exceto'] as const;

function UuidOpcional(descricao?: string): PropertyDecorator {
  return (alvo, chave) => {
    ApiProperty({ type: String, format: 'uuid', nullable: true, description: descricao })(
      alvo,
      chave,
    );
    ValidateIf((_, v) => v !== null)(alvo, chave);
    IsUUID()(alvo, chave);
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

/** Quem criou e quem encerrou a versão, dos eventos de auditoria (vazios na carga do dashboards-one). */
class AutoriaVersaoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '2026-12' }) vigenciaDesde!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Inclusiva; vazia = sem fim.' })
  vigenciaAte!: string | null;
  @ApiProperty({ type: String, nullable: true }) criadoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) criadoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) encerradoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) encerradoEm!: Date | null;
}

/** Uma versão do "fatura" (da sub-regra) ou do "fatura sem sub-regra" (da regra). */
export class VersaoFaturaTipificacaoDto extends AutoriaVersaoDto {
  @ApiProperty() valor!: boolean;
}

/** Datas da vigência: o mês atual e de quando a mudança pode e deve valer. */
class VigenciasTipificacaoDto {
  @ApiProperty({ example: '2026-11' }) mesAtual!: string;
  @ApiProperty({ description: 'Primeira competência em que uma mudança pode valer.' })
  aPartirDeMinimo!: string;
  @ApiProperty({ description: 'A próxima competência (a sugerida no "Vale a partir de").' })
  aPartirDeSugerido!: string;
}

function ListaDeIds(descricao: string, maximo = 300): PropertyDecorator {
  return (alvo, chave) => {
    ApiProperty({ type: [String], format: 'uuid', description: descricao })(alvo, chave);
    IsArray()(alvo, chave);
    ArrayMaxSize(maximo)(alvo, chave);
    IsUUID('all', { each: true })(alvo, chave);
  };
}

export class DadosRegraTipificacaoDto {
  @ApiProperty({ maxLength: 40, example: 'NC' })
  @IsString()
  @MaxLength(40)
  nome!: string;

  @ApiProperty({ type: String, nullable: true, maxLength: 500 })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  descricao!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '#dc2626', description: '`#RRGGBB`.' })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(7)
  cor!: string | null;

  @ApiProperty()
  @IsBoolean()
  ativo!: boolean;
}

export class CriarRegraTipificacaoDto extends DadosRegraTipificacaoDto {
  @ApiProperty({
    description:
      'O laudo que nenhuma linha casou, sem sub-regra, fatura. Vale desde a primeira competência aberta; depois muda por versão.',
  })
  @IsBoolean()
  faturaSemSubregra!: boolean;
}

export class RegraTipificacaoDto extends DadosRegraTipificacaoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() ordem!: number;
  @ApiProperty({ description: 'Regra do cliente sem configuração.' }) padrao!: boolean;
  @ApiProperty({
    description: 'Clientes e unidades com esta regra principal (em vigor ou programada).',
  })
  clientes!: number;
  @ApiProperty({ description: 'O "fatura sem sub-regra" em vigor no mês atual.' })
  faturaSemSubregra!: boolean;
  @ApiProperty({
    type: [VersaoFaturaTipificacaoDto],
    description: 'Da mais nova para a mais antiga.',
  })
  versoes!: VersaoFaturaTipificacaoDto[];
}

export class DadosSubregraTipificacaoDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  regraId!: string;

  @ApiProperty({ maxLength: 40, example: 'NC-NF' })
  @IsString()
  @MaxLength(40)
  nome!: string;

  @ApiProperty({ type: String, nullable: true, maxLength: 500 })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  descricao!: string | null;

  @ApiProperty()
  @IsBoolean()
  ativo!: boolean;
}

export class CriarSubregraTipificacaoDto extends DadosSubregraTipificacaoDto {
  @ApiProperty({
    description:
      'O laudo nesta sub-regra fatura. Vale desde a primeira competência aberta; depois muda por versão.',
  })
  @IsBoolean()
  fatura!: boolean;
}

export class SubregraTipificacaoDto extends DadosSubregraTipificacaoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() ordem!: number;
  @ApiProperty({
    description: 'Clientes e unidades que usam a sub-regra (em vigor ou programada).',
  })
  clientes!: number;
  @ApiProperty({ description: 'O "fatura" em vigor no mês atual.' }) fatura!: boolean;
  @ApiProperty({
    type: [VersaoFaturaTipificacaoDto],
    description: 'Da mais nova para a mais antiga.',
  })
  versoes!: VersaoFaturaTipificacaoDto[];
}

export class TipificacaoDto extends VigenciasTipificacaoDto {
  @ApiProperty({ type: [RegraTipificacaoDto] }) regras!: RegraTipificacaoDto[];
  @ApiProperty({ type: [SubregraTipificacaoDto] }) subregras!: SubregraTipificacaoDto[];
}

/** Nova versão do "fatura" (sub-regra) ou do "fatura sem sub-regra" (regra). */
export class MudarFaturaTipificacaoDto {
  @ApiProperty()
  @IsBoolean()
  fatura!: boolean;

  @APartirDe() aPartirDe!: string;
}

export class LinhaTipificacaoDto {
  @ApiProperty({ enum: TIPOS })
  @IsIn(TIPOS)
  tipo!: (typeof TIPOS)[number];

  @ListaDeIds('Modalidades, especialidades ou prioridades, conforme o tipo.')
  valores!: string[];

  @ApiProperty({
    enum: MODOS,
    description: '`apenas` nunca casa com laudo sem médico; `exceto` sempre casa.',
  })
  @IsIn(MODOS)
  modoMedico!: (typeof MODOS)[number];

  @ListaDeIds('Médicos do filtro.') medicos!: string[];
  @ListaDeIds('Equipes do filtro (valem os membros).') equipes!: string[];

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  subregraId!: string;
}

/** A configuração do cliente ou da unidade, como a tela edita. */
export class ConfiguracaoTipificacaoDto {
  @UuidOpcional('Vazio = a do principal (na unidade) ou a padrão.') regraId!: string | null;
  @UuidOpcional('"Todos os demais".') subregraDemaisId!: string | null;

  @ApiProperty({ type: [LinhaTipificacaoDto], description: 'Vale a primeira que casar.' })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LinhaTipificacaoDto)
  linhas!: LinhaTipificacaoDto[];
}

/** Nova versão da configuração (vazia = "remover": volta a herdar). */
export class SalvarConfiguracaoTipificacaoDto extends ConfiguracaoTipificacaoDto {
  @APartirDe() aPartirDe!: string;
}

/** Uma versão da configuração do cliente, no histórico de vigências. */
export class VersaoConfiguracaoTipificacaoDto extends AutoriaVersaoDto {
  @ApiProperty({
    type: ConfiguracaoTipificacaoDto,
    description:
      'Vazia (sem regra, linhas nem "todos os demais") = segue a do principal ou a padrão.',
  })
  configuracao!: ConfiguracaoTipificacaoDto;
}

export class ClienteTipificacaoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) unificadoEmId!: string | null;
  @ApiProperty({ type: String, nullable: true }) principalNome!: string | null;
}

export class NomeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}

export class TipificacaoClienteDto extends VigenciasTipificacaoDto {
  @ApiProperty({ type: ClienteTipificacaoDto }) cliente!: ClienteTipificacaoDto;
  @ApiProperty({
    type: ConfiguracaoTipificacaoDto,
    nullable: true,
    description:
      'A própria em vigor no mês atual. Vazia = segue a do principal (na unidade) ou a padrão.',
  })
  configuracao!: ConfiguracaoTipificacaoDto | null;
  @ApiProperty({
    type: ConfiguracaoTipificacaoDto,
    nullable: true,
    description: 'Só na unidade: a do principal em vigor.',
  })
  doPrincipal!: ConfiguracaoTipificacaoDto | null;
  @ApiProperty({
    type: [VersaoConfiguracaoTipificacaoDto],
    description: 'Histórico de vigências, da mais nova para a mais antiga.',
  })
  versoes!: VersaoConfiguracaoTipificacaoDto[];
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) regraPadraoId!: string | null;
  @ApiProperty({
    type: [NomeDto],
    description: 'Nome dos médicos citados nas linhas (de todas as versões).',
  })
  medicos!: NomeDto[];
}

export class OpcaoTipificacaoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: String, nullable: true }) cor!: string | null;
}

export class OpcoesTipificacaoDto {
  @ApiProperty({ type: [OpcaoTipificacaoDto] }) modalidades!: OpcaoTipificacaoDto[];
  @ApiProperty({ type: [OpcaoTipificacaoDto] }) especialidades!: OpcaoTipificacaoDto[];
  @ApiProperty({ type: [OpcaoTipificacaoDto] }) prioridades!: OpcaoTipificacaoDto[];
  @ApiProperty({ type: [OpcaoTipificacaoDto] }) equipes!: OpcaoTipificacaoDto[];
}

export class BuscarMedicosQueryDto {
  @ApiProperty({ required: false, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;
}

export class ContagemPreviaDto {
  @ApiProperty() laudos!: number;
  @ApiProperty() volume!: number;
}

export class LinhaPreviaTipificacaoDto {
  @ApiProperty({ example: '2026-11' }) competencia!: string;
  @ApiProperty({ format: 'uuid' }) regraId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) subregraId!: string | null;
  @ApiProperty() fatura!: boolean;
  @ApiProperty({ type: ContagemPreviaDto }) antes!: ContagemPreviaDto;
  @ApiProperty({ type: ContagemPreviaDto }) depois!: ContagemPreviaDto;
}
