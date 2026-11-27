import { ApiProperty } from '@nestjs/swagger';

import { AlternativaPrecoDto, DadosParametrosRepasseDto, ReclassificacaoDto } from './repasse.dto';

export class NomesReclassificacaoDto {
  @ApiProperty({ type: [String], nullable: true, description: 'Nulo = todas.' })
  modalidades!: string[] | null;
  @ApiProperty({ type: [String], nullable: true }) especialidades!: string[] | null;
  @ApiProperty({ type: [String], nullable: true }) categorias!: string[] | null;
  @ApiProperty({ type: [String], nullable: true, description: 'Nulo = todos os médicos.' })
  equipes!: string[] | null;
  @ApiProperty({ type: String, nullable: true }) especialidadeDestino!: string | null;
  @ApiProperty({ type: String, nullable: true }) categoriaDestino!: string | null;
}

export class ReclassificacaoComNomesDto extends ReclassificacaoDto {
  @ApiProperty({ type: NomesReclassificacaoDto }) nomes!: NomesReclassificacaoDto;
  @ApiProperty({ type: String, nullable: true }) criadoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) criadoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) encerradoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) encerradoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) reabertoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) reabertoEm!: Date | null;
}

export class NomesAlternativaDto {
  @ApiProperty({ type: String, nullable: true, description: 'Nulo = todas.' })
  especialidade!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Nulo = laudo sem categoria.' })
  categoriaOrigem!: string | null;
  @ApiProperty() categoriaDestino!: string;
}

export class AlternativaComNomesDto extends AlternativaPrecoDto {
  @ApiProperty({ type: NomesAlternativaDto }) nomes!: NomesAlternativaDto;
  @ApiProperty({ type: String, nullable: true }) criadoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) criadoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) encerradoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) encerradoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) reabertoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) reabertoEm!: Date | null;
}

class VigenciaDaTelaRepasseDto {
  @ApiProperty({ example: '2026-11' }) mesAtual!: string;
  @ApiProperty() aPartirDeMinimo!: string;
  @ApiProperty() aPartirDeSugerido!: string;
}

export class RegrasComNomesDto extends VigenciaDaTelaRepasseDto {
  @ApiProperty({ type: [ReclassificacaoComNomesDto], description: 'Em ordem; todas as versões.' })
  reclassificacoes!: ReclassificacaoComNomesDto[];
  @ApiProperty({ type: [AlternativaComNomesDto] }) alternativas!: AlternativaComNomesDto[];
}

export class VersaoParametrosDto extends DadosParametrosRepasseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '2026-11' }) vigenciaDesde!: string;
  @ApiProperty({ type: String, nullable: true, description: 'A véspera da versão seguinte.' })
  vigenciaAte!: string | null;
  @ApiProperty({ type: String, nullable: true }) contratadoRegistro!: string | null;
  @ApiProperty({ type: String, nullable: true }) criadoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) criadoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) encerradoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) encerradoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) reabertoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) reabertoEm!: Date | null;
}

export class ParametrosComVersoesDto extends VigenciaDaTelaRepasseDto {
  @ApiProperty({ type: [VersaoParametrosDto], description: 'A mais nova primeiro.' })
  versoes!: VersaoParametrosDto[];
}
