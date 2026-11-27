import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { aparar } from '../../../../catalogo/comum/dto';
import {
  INTEGRACOES_BANCARIAS,
  type IntegracaoBancaria,
  TIPOS_CONTA_BANCARIA,
  type TipoContaBancaria,
} from '../../../domain/conta-bancaria';
import { ListarFinanceiroDto } from './comum.dto';

const TIPO = { enum: TIPOS_CONTA_BANCARIA, enumName: 'TipoContaBancaria' };
const INTEGRACAO = { enum: INTEGRACOES_BANCARIAS, enumName: 'IntegracaoBancaria' };

export class ListarContasBancariasDto extends ListarFinanceiroDto {
  @ApiProperty({
    description: 'Id da empresa ou `todas` (escolha explícita; nunca vazio).',
    example: 'todas',
  })
  @ValidateIf((o: ListarContasBancariasDto) => o.empresa !== 'todas')
  @IsUUID()
  empresa!: string;
}

/** Corpo de criar e editar conta bancária. */
export class ContaBancariaDto {
  @ApiProperty({ format: 'uuid', description: 'A empresa (contratado que usa o financeiro).' })
  @IsUUID()
  contratadoId!: string;

  @ApiProperty({ example: 'Itaú cobrança', maxLength: 80 })
  @Transform(aparar)
  @IsString()
  @MaxLength(80)
  apelido!: string;

  @ApiProperty(TIPO)
  @IsIn(TIPOS_CONTA_BANCARIA)
  tipo!: TipoContaBancaria;

  @ApiPropertyOptional({ type: String, nullable: true, example: '341', maxLength: 3 })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  bancoCodigo: string | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '0123', maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  agencia: string | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '45678', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  conta: string | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '9', maxLength: 2 })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  digito: string | null = null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    description:
      'Ponto de partida do saldo pelo One, em centavos; pode ser negativo. Vem junto com a data. ' +
      'Sem integração, vazio é zero no dia da criação da conta; com o Itaú, não se pede (o saldo ' +
      'virá do extrato), e o já informado fica guardado.',
  })
  @IsOptional()
  @IsInt()
  saldoInicialCentavos: number | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date', example: '2026-12-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  saldoInicialEm: string | null = null;

  @ApiProperty(INTEGRACAO)
  @IsIn(INTEGRACOES_BANCARIAS)
  integracao!: IntegracaoBancaria;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'ITAU_TELEIMAGEM',
    maxLength: 60,
    description: 'Prefixo das variáveis de ambiente da credencial; nunca o segredo.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  credencial: string | null = null;

  @ApiProperty({ description: 'Marcar desmarca a padrão anterior da empresa; só ativa.' })
  @IsBoolean()
  padraoRecebimento!: boolean;

  @ApiProperty()
  @IsBoolean()
  ativa!: boolean;
}

export class ContaBancariaItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) contratadoId!: string;
  @ApiProperty() empresaNome!: string;
  @ApiProperty() apelido!: string;
  @ApiProperty(TIPO) tipo!: TipoContaBancaria;
  @ApiProperty({ type: String, nullable: true }) bancoCodigo!: string | null;
  @ApiProperty({ type: String, nullable: true }) agencia!: string | null;
  @ApiProperty({ type: String, nullable: true }) conta!: string | null;
  @ApiProperty({ type: String, nullable: true }) digito!: string | null;
  @ApiProperty({ type: 'integer', nullable: true }) saldoInicialCentavos!: number | null;
  @ApiProperty({ type: String, nullable: true, format: 'date' }) saldoInicialEm!: string | null;
  @ApiProperty({
    format: 'date',
    description: 'O dia do saldo inicial ou, sem ele, o da criação da conta (de Brasília).',
  })
  saldoContadoDesde!: string;
  @ApiProperty({
    type: 'integer',
    description:
      'Saldo pelo One: o saldo inicial (vazio é zero) mais as baixas não estornadas desde ' +
      '`saldoContadoDesde` (as baixas vêm com os títulos).',
  })
  saldoPeloOneCentavos!: number;
  @ApiProperty(INTEGRACAO) integracao!: IntegracaoBancaria;
  @ApiProperty({ type: String, nullable: true }) credencial!: string | null;
  @ApiProperty() padraoRecebimento!: boolean;
  @ApiProperty() ativa!: boolean;
}

export class VariavelCredencialDto {
  @ApiProperty({ example: 'ITAU_TELEIMAGEM_CLIENT_ID' }) nome!: string;
  @ApiProperty({ description: 'A variável existe no servidor (o valor nunca sai da API).' })
  configurada!: boolean;
}

export class ContaBancariaDetalheDto extends ContaBancariaItemDto {
  @ApiProperty({ type: [VariavelCredencialDto] }) variaveisCredencial!: VariavelCredencialDto[];
}

export class PaginaContasBancariasDto {
  @ApiProperty({ type: [ContaBancariaItemDto] }) itens!: ContaBancariaItemDto[];
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) pagina!: number;
  @ApiProperty({ type: 'integer' }) porPagina!: number;
}

export class EmpresaFinanceiroDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}
