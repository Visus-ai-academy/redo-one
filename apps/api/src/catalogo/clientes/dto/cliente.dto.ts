import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { aparar, ListarDto } from '../../comum/dto';
import type { TipoAlias, TipoPessoa } from '../clientes.repository';

const TIPOS_PESSOA: TipoPessoa[] = ['PJ', 'PF'];
const TIPOS_ALIAS: TipoAlias[] = ['exato', 'prefixo', 'normalizado'];

export class ListarClientesDto extends ListarDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Só os clientes desta empresa que fatura.' })
  @IsOptional()
  @IsUUID()
  contratadoId?: string;
}

/** Corpo de criar e editar cliente (só o cadastro básico do catálogo). */
export class ClienteDto {
  @ApiProperty({ example: 'CEDIDIAG', maxLength: 150, description: 'Nome igual ao da MobileMed.' })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nome!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nomeFantasia: string | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  razaoSocial: string | null = null;

  @ApiPropertyOptional({ enum: TIPOS_PESSOA, nullable: true })
  @IsOptional()
  @IsIn(TIPOS_PESSOA)
  tipoPessoa: TipoPessoa | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '12.345.678/0001-90' })
  @IsOptional()
  @IsString()
  @MaxLength(18)
  cnpj: string | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '000.000.000-00' })
  @IsOptional()
  @IsString()
  @MaxLength(14)
  cpf: string | null = null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Empresa que fatura.' })
  @IsOptional()
  @IsUUID()
  contratadoId: string | null = null;

  @ApiProperty()
  @IsBoolean()
  ativo!: boolean;

  @ApiProperty({ description: 'Fora dos painéis; continua no faturamento.' })
  @IsBoolean()
  ocultoDashboards!: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacoes: string | null = null;
}

export class AliasDto {
  @ApiProperty({ enum: TIPOS_ALIAS })
  @IsIn(TIPOS_ALIAS)
  tipo!: TipoAlias;

  @ApiProperty({ example: 'PRN TELE_', maxLength: 150 })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  padrao!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacoes: string | null = null;
}

export class UnidadeDto {
  @ApiProperty({ format: 'uuid', description: 'Cliente que passa a responder pelo principal.' })
  @IsUUID()
  clienteId!: string;
}

export class ClienteRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}

export class ContratadoResumoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() razaoSocial!: string;
}

export class AliasItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: TIPOS_ALIAS }) tipo!: TipoAlias;
  @ApiProperty() padrao!: string;
  @ApiProperty({ type: String, nullable: true }) observacoes!: string | null;
}

export class ClienteResumoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: String, nullable: true }) nomeFantasia!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Só dígitos.' }) cnpj!: string | null;
  @ApiProperty({ type: ContratadoResumoDto, nullable: true })
  contratado!: ContratadoResumoDto | null;
  @ApiProperty() ativo!: boolean;
  @ApiProperty() ocultoDashboards!: boolean;
  @ApiProperty() totalAliases!: number;
  @ApiProperty({ type: ClienteRefDto, nullable: true, description: 'Principal, se for unidade.' })
  unificadoEm!: ClienteRefDto | null;
}

export class ClienteDetalheDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: String, nullable: true }) nomeFantasia!: string | null;
  @ApiProperty({ type: String, nullable: true }) razaoSocial!: string | null;
  @ApiProperty({ enum: TIPOS_PESSOA, nullable: true }) tipoPessoa!: TipoPessoa | null;
  @ApiProperty({ type: String, nullable: true }) cnpj!: string | null;
  @ApiProperty({ type: String, nullable: true }) cpf!: string | null;
  @ApiProperty({ type: ContratadoResumoDto, nullable: true })
  contratado!: ContratadoResumoDto | null;
  @ApiProperty() ativo!: boolean;
  @ApiProperty() ocultoDashboards!: boolean;
  @ApiProperty({ type: String, nullable: true }) observacoes!: string | null;
  @ApiProperty({ type: [AliasItemDto] }) aliases!: AliasItemDto[];
  @ApiProperty({ type: ClienteRefDto, nullable: true, description: 'Principal, se for unidade.' })
  unificadoEm!: ClienteRefDto | null;
  @ApiProperty({ type: [ClienteRefDto], description: 'Unidades unificadas neste cliente.' })
  unidades!: ClienteRefDto[];
}

export class PaginaClientesDto {
  @ApiProperty({ type: [ClienteResumoDto] }) itens!: ClienteResumoDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}
