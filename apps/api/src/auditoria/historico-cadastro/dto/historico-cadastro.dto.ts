import { ApiProperty } from '@nestjs/swagger';

import { AtorHistoricoDto } from '../../../escala/historico/dto/historico.dto';

export class ItemHistoricoCadastroDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() ocorridoEm!: Date;
  @ApiProperty({ type: AtorHistoricoDto }) ator!: AtorHistoricoDto;

  @ApiProperty({
    example: 'medico',
    description:
      '`medico`, `medico_distribuicao`, `arranjos_medico`, `usuario` (conta do portal do médico), `equipe` (no médico, com a ação `membro_entrou`, `membro_saiu` ou `equipe_excluida`), `cliente`, `exame` ou `de_para_valor_exame`.',
  })
  entidade!: string;

  @ApiProperty() entidadeId!: string;
  @ApiProperty({ example: 'alterado' }) acao!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Campos antes da mudança (sensíveis já mascarados); `null` na criação.',
  })
  antes!: Record<string, unknown> | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Campos depois da mudança (sensíveis já mascarados); `null` na remoção.',
  })
  depois!: Record<string, unknown> | null;
}

export class PaginaHistoricoCadastroDto {
  @ApiProperty({ type: [ItemHistoricoCadastroDto] }) itens!: ItemHistoricoCadastroDto[];
  @ApiProperty() total!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Nome legível de cada id citado nos itens da página (médico, nível, equipe, usuário, papel, cliente, contratado, exame, modalidade, especialidade, segmento, categoria, prioridade). Id sem par fica de fora.',
    example: { '3f1c…': 'NEURO' },
  })
  nomes!: Record<string, string>;

  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}
