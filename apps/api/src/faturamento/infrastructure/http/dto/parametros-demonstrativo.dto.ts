import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { aparar } from '../../../../catalogo/comum/dto';

import { APartirDe } from './precos.dto';

function UuidOuNulo(descricao: string): PropertyDecorator {
  return (alvo, chave) => {
    ApiProperty({ type: String, format: 'uuid', nullable: true, description: descricao })(
      alvo,
      chave,
    );
    ValidateIf((_, v) => v !== null)(alvo, chave);
    IsUUID()(alvo, chave);
  };
}

export class ParametrosDemonstrativoDto {
  @ApiProperty({ description: 'Laudo marcado DUPLICADO pela MobileMed é cobrado.' })
  @IsBoolean()
  cobraDuplicados!: boolean;
  @ApiProperty({ description: 'Laudo de cliente inativo é cobrado.' })
  @IsBoolean()
  cobraClientesInativos!: boolean;
  @UuidOuNulo('Categoria de quem chega sem categoria; vazio = o arranjo fica incompleto (aviso).')
  categoriaPadraoId!: string | null;
  @UuidOuNulo('Prioridade de quem chega sem prioridade; vazio = o arranjo fica incompleto (aviso).')
  prioridadePadraoId!: string | null;
}

export class MudarParametrosDemonstrativoDto extends ParametrosDemonstrativoDto {
  @APartirDe() aPartirDe!: string;
}

export class VersaoParametrosDto extends ParametrosDemonstrativoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true, description: 'AAAA-MM; vazio = desde sempre.' })
  desde!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) criadoEm!: Date;
  @ApiProperty({ type: String, nullable: true, description: 'Quem criou; vazio = carga.' })
  criadoPor!: string | null;
}

export class QuadroParametrosDto {
  @ApiProperty({ example: '2026-11' }) mesAtual!: string;
  @ApiProperty({ example: '2026-11' }) aPartirDeMinimo!: string;
  @ApiProperty({ example: '2026-12' }) aPartirDeSugerido!: string;
  @ApiProperty({ type: ParametrosDemonstrativoDto, description: 'O que vale no mês atual.' })
  vigente!: ParametrosDemonstrativoDto;
  @ApiProperty({ type: [VersaoParametrosDto], description: 'A mais nova primeiro.' })
  historico!: VersaoParametrosDto[];
}

export class MudarAlternativaPrecoDto {
  @APartirDe() aPartirDe!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() prioridadeId!: string;
  @UuidOuNulo('Prioridade tentada quando a do laudo não tem preço; vazio = sem alternativa.')
  alternativaId!: string | null;
}

export class ParAlternativaDto {
  @ApiProperty({ format: 'uuid' }) prioridadeId!: string;
  @ApiProperty({ format: 'uuid' }) alternativaId!: string;
}

export class VersaoAlternativaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) prioridadeId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) alternativaId!: string | null;
  @ApiProperty({ type: String, nullable: true }) desde!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) criadoEm!: Date;
  @ApiProperty({ type: String, nullable: true }) criadoPor!: string | null;
}

export class QuadroAlternativasDto {
  @ApiProperty() mesAtual!: string;
  @ApiProperty() aPartirDeMinimo!: string;
  @ApiProperty() aPartirDeSugerido!: string;
  @ApiProperty({ type: [ParAlternativaDto], description: 'Os pares que valem no mês atual.' })
  vigentes!: ParAlternativaDto[];
  @ApiProperty({ type: [VersaoAlternativaDto], description: 'A mais nova primeiro.' })
  historico!: VersaoAlternativaDto[];
}

export class IdCriadoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}

/** "Todos" explícito; sem ele, a lista (que não pode ser vazia). */
export class RecorteReclassificacaoDto {
  @ApiProperty() @IsBoolean() todos!: boolean;
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class CriarReclassificacaoFaturamentoDto {
  @APartirDe() aPartirDe!: string;
  @ApiProperty({ type: 'integer', description: 'Ordem: a primeira que casa vale.' })
  @IsInt()
  @Min(0)
  ordem!: number;
  @ApiProperty({ maxLength: 300 })
  @Transform(aparar)
  @IsString()
  @MaxLength(300)
  descricao!: string;
  @ApiProperty({ type: RecorteReclassificacaoDto })
  @ValidateNested()
  @Type(() => RecorteReclassificacaoDto)
  modalidades!: RecorteReclassificacaoDto;
  @ApiProperty({ type: RecorteReclassificacaoDto })
  @ValidateNested()
  @Type(() => RecorteReclassificacaoDto)
  especialidades!: RecorteReclassificacaoDto;
  @ApiProperty({ type: RecorteReclassificacaoDto })
  @ValidateNested()
  @Type(() => RecorteReclassificacaoDto)
  categorias!: RecorteReclassificacaoDto;
  @ApiProperty({
    type: RecorteReclassificacaoDto,
    description: 'Equipes; todos = todos os médicos.',
  })
  @ValidateNested()
  @Type(() => RecorteReclassificacaoDto)
  equipes!: RecorteReclassificacaoDto;
  @UuidOuNulo('Especialidade de destino; vazio = mantém a do laudo.')
  especialidadeDestinoId!: string | null;
  @UuidOuNulo('Categoria de destino; vazio = mantém a do laudo.')
  categoriaDestinoId!: string | null;
}

export class EncerrarReclassificacaoFaturamentoDto {
  @APartirDe() aPartirDe!: string;
}

export class ReclassificacaoFaturamentoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: 'integer' }) ordem!: number;
  @ApiProperty() descricao!: string;
  @ApiProperty({ type: [String], nullable: true, description: 'Nulo = todas.' })
  modalidadeIds!: string[] | null;
  @ApiProperty({ type: [String], nullable: true }) especialidadeIds!: string[] | null;
  @ApiProperty({ type: [String], nullable: true }) categoriaIds!: string[] | null;
  @ApiProperty({ type: [String], nullable: true, description: 'Nulo = todos os médicos.' })
  equipeIds!: string[] | null;
  @ApiProperty({ type: String, nullable: true }) especialidadeDestinoId!: string | null;
  @ApiProperty({ type: String, nullable: true }) categoriaDestinoId!: string | null;
  @ApiProperty({ type: String, nullable: true }) vigenciaDesde!: string | null;
  @ApiProperty({ type: String, nullable: true }) vigenciaAte!: string | null;
}
