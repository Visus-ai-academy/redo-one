import { Controller, Get, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import { CriarImportacaoMobileMed } from '../../application/use-cases/criar-importacao-mobilemed';

export class SituacaoMobileMedDto {
  @ApiProperty({ description: 'A importação da MobileMed está ligada neste ambiente.' })
  ligada!: boolean;
}

export class ImportacoesCriadasDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Uma importação para os laudos e outra para o compartilhamento.',
  })
  ids!: string[];
}

/** Importação automática da MobileMed: se está ligada e o "Importar agora". */
@ApiTags('ingestao')
@Controller('ingestao/mobilemed')
export class ImportacaoMobileMedController {
  constructor(private readonly criar: CriarImportacaoMobileMed) {}

  @Get()
  @Permissao('importacao.ver')
  @ApiOkResponse({ type: SituacaoMobileMedDto })
  situacao(): SituacaoMobileMedDto {
    return { ligada: this.criar.ligada };
  }

  @Post('importacoes')
  @Permissao('importacao.criar')
  @ApiCreatedResponse({ type: ImportacoesCriadasDto })
  @ApiConflictResponse({ description: 'Desligada neste ambiente ou já há uma em curso.' })
  async importarAgora(@PrincipalAtual() ator: PrincipalUsuario): Promise<ImportacoesCriadasDto> {
    return { ids: await this.criar.manual(ator.usuarioId) };
  }
}
