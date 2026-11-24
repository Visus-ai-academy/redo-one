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
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

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

  @ApiProperty({ description: 'O laudo que nenhuma linha casou, sem sub-regra, fatura.' })
  @IsBoolean()
  faturaSemSubregra!: boolean;

  @ApiProperty()
  @IsBoolean()
  ativo!: boolean;
}

export class RegraTipificacaoDto extends DadosRegraTipificacaoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() ordem!: number;
  @ApiProperty({ description: 'Regra do cliente sem configuração.' }) padrao!: boolean;
  @ApiProperty({ description: 'Clientes e unidades com esta regra principal.' }) clientes!: number;
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

  @ApiProperty({ description: 'O laudo nesta sub-regra fatura.' })
  @IsBoolean()
  fatura!: boolean;

  @ApiProperty()
  @IsBoolean()
  ativo!: boolean;
}

export class SubregraTipificacaoDto extends DadosSubregraTipificacaoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() ordem!: number;
  @ApiProperty({ description: 'Clientes e unidades que usam a sub-regra.' }) clientes!: number;
}

export class TipificacaoDto {
  @ApiProperty({ type: [RegraTipificacaoDto] }) regras!: RegraTipificacaoDto[];
  @ApiProperty({ type: [SubregraTipificacaoDto] }) subregras!: SubregraTipificacaoDto[];
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

export class ConfiguracaoTipificacaoRegistradaDto extends ConfiguracaoTipificacaoDto {
  @ApiProperty({ type: String, format: 'date-time' }) atualizadoEm!: Date;
  @ApiProperty({ type: String, nullable: true, description: 'Vazio na carga do dashboards-one.' })
  atualizadoPor!: string | null;
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

export class TipificacaoClienteDto {
  @ApiProperty({ type: ClienteTipificacaoDto }) cliente!: ClienteTipificacaoDto;
  @ApiProperty({
    type: ConfiguracaoTipificacaoRegistradaDto,
    nullable: true,
    description: 'Vazia = segue a do principal (na unidade) ou a padrão.',
  })
  configuracao!: ConfiguracaoTipificacaoRegistradaDto | null;
  @ApiProperty({
    type: ConfiguracaoTipificacaoRegistradaDto,
    nullable: true,
    description: 'Só na unidade: a do principal.',
  })
  doPrincipal!: ConfiguracaoTipificacaoRegistradaDto | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) regraPadraoId!: string | null;
  @ApiProperty({ type: [NomeDto], description: 'Nome dos médicos citados nas linhas.' })
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
