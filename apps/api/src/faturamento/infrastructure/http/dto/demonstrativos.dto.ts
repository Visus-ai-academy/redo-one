import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Matches, Min } from 'class-validator';

import { PaginacaoDto } from '../../../../catalogo/comum/dto';
import { MENSAGEM_COMPETENCIA, PADRAO_COMPETENCIA } from './competencia.dto';

const ORIGENS = ['previa', 'fechamento', 'recalculo'] as const;
const ORIGENS_PRECO = ['unidade', 'principal', 'padrao', 'ajuste'] as const;
const COMO = ['exato', 'prioridade_alternativa', 'menor_faixa'] as const;
const SITUACOES = [
  'fatura',
  'nao_fatura',
  'sem_tipificacao',
  'arranjo_incompleto',
  'excluido_ajuste',
  'nao_assinado',
  'duplicado',
  'cliente_inativo',
] as const;

export class ListarDemonstrativosQueryDto extends PaginacaoDto {
  @ApiProperty({ example: '2026-11', pattern: PADRAO_COMPETENCIA.source })
  @Matches(PADRAO_COMPETENCIA, { message: `competencia: ${MENSAGEM_COMPETENCIA}` })
  competencia!: string;
}

export class DemonstrativoClienteParamDto {
  @ApiProperty({ example: '2026-11', pattern: PADRAO_COMPETENCIA.source })
  @Matches(PADRAO_COMPETENCIA, { message: `competencia: ${MENSAGEM_COMPETENCIA}` })
  competencia!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() clienteId!: string;
}

export class VersaoQueryDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 1, description: 'Sem ela, a vigente.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  versao?: number;
}

export class ResumoDemonstrativoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() competencia!: string;
  @ApiProperty({ format: 'uuid' }) clienteId!: string;
  @ApiProperty() cliente!: string;
  @ApiProperty({ type: 'integer' }) versao!: number;
  @ApiProperty() vigente!: boolean;
  @ApiProperty({ enum: ORIGENS, enumName: 'OrigemDemonstrativo' })
  origem!: (typeof ORIGENS)[number];
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) recalculoId!: string | null;
  @ApiProperty({ type: 'integer', description: 'Laudos que faturam.' }) laudos!: number;
  @ApiProperty({ type: Number, description: 'Soma do volume (e das peças da quebra).' })
  quantidade!: number;
  @ApiProperty({ type: 'integer', description: 'Valor dos exames, em centavos.' })
  valorCentavos!: number;
  @ApiProperty({ type: Number }) quantidadeSemPreco!: number;
  @ApiProperty({ description: 'Nada a faturar: R$ 0.' }) nadaAFaturar!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) geradoEm!: Date;
}

export class TotaisCompetenciaDto {
  @ApiProperty({ type: 'integer' }) clientes!: number;
  @ApiProperty({ type: 'integer' }) laudos!: number;
  @ApiProperty({ type: Number }) quantidade!: number;
  @ApiProperty({ type: 'integer' }) valorCentavos!: number;
  @ApiProperty({ type: Number }) quantidadeSemPreco!: number;
}

export class PaginaDemonstrativosDto {
  @ApiProperty({ type: [ResumoDemonstrativoDto] }) itens!: ResumoDemonstrativoDto[];
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) pagina!: number;
  @ApiProperty({ type: 'integer' }) porPagina!: number;
  @ApiProperty({ type: TotaisCompetenciaDto }) totais!: TotaisCompetenciaDto;
}

export class ArranjoDemonstrativoDto {
  @ApiProperty({ format: 'uuid' }) modalidadeId!: string;
  @ApiProperty({ format: 'uuid' }) especialidadeId!: string;
  @ApiProperty({ format: 'uuid' }) categoriaId!: string;
  @ApiProperty({ format: 'uuid' }) prioridadeId!: string;
}

export class NomesItemDto {
  @ApiProperty() membro!: string;
  @ApiProperty() modalidade!: string;
  @ApiProperty() especialidade!: string;
  @ApiProperty() categoria!: string;
  @ApiProperty() prioridade!: string;
}

export class ItemDemonstrativoDto extends ArranjoDemonstrativoDto {
  @ApiProperty({ format: 'uuid', description: 'Unidade de origem ou o próprio cliente.' })
  membroId!: string;
  @ApiProperty({ example: '2026-11-03' }) dia!: string;
  @ApiProperty({ type: 'integer', nullable: true, description: 'Vazio = sem preço.' })
  unitarioCentavos!: number | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) linhaPrecoId!: string | null;
  @ApiProperty({ enum: ORIGENS_PRECO, enumName: 'OrigemPrecoItem', nullable: true })
  origem!: (typeof ORIGENS_PRECO)[number] | null;
  @ApiProperty({ enum: COMO, enumName: 'ComoAchouPreco', nullable: true })
  como!: (typeof COMO)[number] | null;
  @ApiProperty({ type: Number }) quantidade!: number;
  @ApiProperty({ type: 'integer' }) valorCentavos!: number;
  @ApiProperty({ type: 'integer' }) laudos!: number;
  @ApiProperty({ type: NomesItemDto }) nomes!: NomesItemDto;
}

export class DemonstrativoDetalhadoDto extends ResumoDemonstrativoDto {
  @ApiProperty({ type: [ItemDemonstrativoDto] }) itens!: ItemDemonstrativoDto[];
}

export class DemonstrativoClienteDto {
  @ApiProperty({ type: DemonstrativoDetalhadoDto }) demonstrativo!: DemonstrativoDetalhadoDto;
  @ApiProperty({
    type: [ResumoDemonstrativoDto],
    description: 'Todas as versões, a mais nova primeiro.',
  })
  versoes!: ResumoDemonstrativoDto[];
}

export class LaudoDoDetalheDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() competencia!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) clienteId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) unidadeId!: string | null;
  @ApiProperty() estudo!: string;
  @ApiProperty() diaLaudo!: string;
  @ApiProperty({ type: Number }) volume!: number;
  @ApiProperty() status!: string;
}

export class AjusteDoDetalheDto {
  @ApiProperty({ enum: ['valor', 'excluir'], enumName: 'TipoAjusteLaudo' }) tipo!:
    | 'valor'
    | 'excluir';
  @ApiPropertyOptional({ type: 'integer' }) unitarioCentavos?: number;
}

export class ParcelaLaudoDto {
  @ApiProperty({ type: ArranjoDemonstrativoDto }) arranjo!: ArranjoDemonstrativoDto;
  @ApiProperty({ type: Number }) quantidade!: number;
  @ApiProperty({ type: 'integer', nullable: true }) unitarioCentavos!: number | null;
  @ApiProperty({ type: 'integer' }) valorCentavos!: number;
  @ApiProperty({ enum: ORIGENS_PRECO, enumName: 'OrigemPrecoItem', nullable: true })
  origem!: (typeof ORIGENS_PRECO)[number] | null;
  @ApiProperty({ enum: COMO, enumName: 'ComoAchouPreco', nullable: true })
  como!: (typeof COMO)[number] | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) linhaPrecoId!: string | null;
}

export class DetalheLaudoDto {
  @ApiProperty({ type: LaudoDoDetalheDto }) laudo!: LaudoDoDetalheDto;
  @ApiProperty({ enum: SITUACOES, enumName: 'SituacaoLaudoDemonstrativo' })
  situacao!: (typeof SITUACOES)[number];
  @ApiProperty({ format: 'uuid' }) membroId!: string;
  @ApiProperty({ type: AjusteDoDetalheDto, nullable: true }) ajuste!: AjusteDoDetalheDto | null;
  @ApiProperty({ type: [ParcelaLaudoDto], description: 'O laudo inteiro, ou cada peça da quebra.' })
  parcelas!: ParcelaLaudoDto[];
}
