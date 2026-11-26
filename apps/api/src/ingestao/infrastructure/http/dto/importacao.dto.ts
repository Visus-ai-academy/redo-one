import { ApiProperty } from '@nestjs/swagger';

const STATUS = ['na_fila', 'processando', 'concluida', 'recusada', 'erro'] as const;

export class PessoaResumoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}

export class ImportacaoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: STATUS, enumName: 'StatusImportacao' }) status!: (typeof STATUS)[number];
  @ApiProperty({
    enum: ['upload_manual', 'mobilemed', 'carga_legado'],
    enumName: 'OrigemImportacao',
    description: 'carga_legado: laudos copiados do dashboards-one pela carga.',
  })
  origem!: 'upload_manual' | 'mobilemed' | 'carga_legado';
  @ApiProperty({
    enum: ['laudos', 'compartilhamento'],
    enumName: 'FormatoImportacao',
    nullable: true,
    description: 'Relatório de laudos ou de compartilhamento (CRD_APOIO); vazio antes da leitura.',
  })
  formato!: 'laudos' | 'compartilhamento' | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Planilha enviada; vazio na importação da MobileMed.',
  })
  nomeArquivo!: string | null;
  @ApiProperty({ type: PessoaResumoDto, nullable: true }) enviadaPor!: PessoaResumoDto | null;
  @ApiProperty({ type: String, format: 'date-time' }) criadaEm!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) iniciadaEm!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) concluidaEm!: Date | null;
  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description:
      'Primeiro dia do laudo coberto (Brasília): o do arquivo, ou o período pedido à MobileMed.',
  })
  janelaInicio!: string | null;
  @ApiProperty({ type: String, format: 'date', nullable: true }) janelaFim!: string | null;
  @ApiProperty({ type: 'integer', nullable: true }) linhasArquivo!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) inseridos!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) atualizados!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) inalterados!: number | null;
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Laudos da janela que não vieram no arquivo.',
  })
  removidos!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) invalidas!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) ignoradasCompetenciaFechada!: number | null;
  @ApiProperty({ type: String, nullable: true, description: 'Motivo da recusa ou do erro.' })
  mensagem!: string | null;
}

export class ErroLinhaDto {
  @ApiProperty({ type: 'integer', description: 'Linha na planilha (o cabeçalho é a 1).' })
  linha!: number;
  @ApiProperty() mensagem!: string;
}

export class ImportacaoDetalheDto extends ImportacaoDto {
  @ApiProperty({ type: [ErroLinhaDto], description: 'Até 20 linhas que não puderam ser lidas.' })
  errosLinhas!: ErroLinhaDto[];
}

export class PaginaImportacoesDto {
  @ApiProperty({ type: [ImportacaoDto] }) itens!: ImportacaoDto[];
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) pagina!: number;
  @ApiProperty({ type: 'integer' }) porPagina!: number;
}

export class UrlDto {
  @ApiProperty({ description: 'URL assinada e temporária.' }) url!: string;
}
