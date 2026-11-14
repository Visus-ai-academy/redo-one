import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { aparar } from '../comum/dto';
import { OpcoesService } from './opcoes.service';

class OpcaoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}

class OpcaoComCorDto extends OpcaoDto {
  @ApiProperty({ type: String, nullable: true }) cor!: string | null;
}

class OpcaoSubespecialidadeDto extends OpcaoComCorDto {
  @ApiProperty({ type: [String], format: 'uuid' }) especialidadeIds!: string[];
}

export class OpcoesCatalogoDto {
  @ApiProperty({ type: [OpcaoComCorDto] }) modalidades!: OpcaoComCorDto[];
  @ApiProperty({ type: [OpcaoComCorDto] }) especialidades!: OpcaoComCorDto[];
  @ApiProperty({ type: [OpcaoSubespecialidadeDto] }) subespecialidades!: OpcaoSubespecialidadeDto[];
  @ApiProperty({ type: [OpcaoComCorDto] }) categoriasExame!: OpcaoComCorDto[];
  @ApiProperty({ type: [OpcaoComCorDto] }) prioridades!: OpcaoComCorDto[];
  @ApiProperty({ type: [OpcaoDto] }) contratados!: OpcaoDto[];
}

export class OpcaoExameDto extends OpcaoDto {
  @ApiProperty({ type: String, nullable: true, description: 'Código da modalidade.' })
  modalidade!: string | null;
}

export class BuscarExamesDto {
  @ApiPropertyOptional({ description: 'Parte do nome ou o código.' })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;
}

/**
 * Itens ativos para os campos de escolha. Qualquer pessoa logada lê: são dados de referência,
 * e quem edita exames precisa das modalidades sem ter acesso à tela do catálogo.
 */
@ApiTags('catalogo')
@Controller('catalogo/opcoes')
export class OpcoesController {
  constructor(private readonly service: OpcoesService) {}

  @Get()
  @ApiOkResponse({ type: OpcoesCatalogoDto })
  listas(): Promise<OpcoesCatalogoDto> {
    return this.service.listas();
  }

  @Get('exames')
  @ApiOkResponse({ type: [OpcaoExameDto], description: 'Até 20 exames ativos.' })
  exames(@Query() query: BuscarExamesDto): Promise<OpcaoExameDto[]> {
    return this.service.exames(query.busca ?? '');
  }
}
