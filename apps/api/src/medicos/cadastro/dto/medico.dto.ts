import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { aparar, ListarDto } from '../../../catalogo/comum/dto';
import type { AliasMedico, FuncaoMedico } from '../medicos.repository';

const FUNCOES: FuncaoMedico[] = ['STAFF', 'FELLOW'];
const ORIGENS: AliasMedico['origem'][] = ['manual', 'volumetria', 'repasse', 'repasse_upload'];

/** Vazio vira `null` (o formulário manda "" no campo apagado). */
const vazioNulo = ({ value }: { value: unknown }) => {
  const v = typeof value === 'string' ? value.trim() : value;
  return v === '' ? null : v;
};

export class ListarMedicosDto extends ListarDto {
  @ApiPropertyOptional({ description: 'Parte do nome, o CRM ou o id na MobileMed.' })
  declare busca?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  nivelId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Só os membros desta equipe.' })
  @IsOptional()
  @IsUUID()
  equipeId?: string;
}

/** Corpo de criar e editar o cadastro do médico (sem os dados de pagamento). */
export class MedicoDto {
  @ApiProperty({ example: 'Dr. Augusto Lima', maxLength: 150 })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nome!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 30 })
  @Transform(vazioNulo)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  crm: string | null = null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 1,
    description: 'Id da conta na MobileMed.',
  })
  @Transform(vazioNulo)
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O ID da MobileMed é um número inteiro.' })
  @Min(1, { message: 'O ID da MobileMed é um número positivo.' })
  @Max(2_147_483_647)
  idMobilemed: number | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @Transform(vazioNulo)
  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido.' })
  @MaxLength(200)
  email: string | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 30 })
  @Transform(vazioNulo)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefone: string | null = null;

  @ApiProperty()
  @IsBoolean()
  ativo!: boolean;

  @ApiProperty({ description: 'Fora dos painéis (volumetria, executivo).' })
  @IsBoolean()
  ocultoDashboards!: boolean;

  @ApiProperty({ description: 'Senioridade; independe da função.' })
  @IsBoolean()
  senior!: boolean;

  @ApiProperty({ description: 'Fez fellowship (formação concluída).' })
  @IsBoolean()
  fellowship!: boolean;

  @ApiPropertyOptional({ enum: FUNCOES, nullable: true })
  @Transform(vazioNulo)
  @IsOptional()
  @IsIn(FUNCOES)
  funcao: FuncaoMedico | null = null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @Transform(vazioNulo)
  @IsOptional()
  @IsUUID()
  nivelId: string | null = null;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true, example: '2024-03-01' })
  @Transform(vazioNulo)
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Data de início inválida.' })
  @MaxLength(10)
  dataInicioVinculo: string | null = null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacoes: string | null = null;
}

export class AliasMedicoDto {
  @ApiProperty({ example: 'Dr. A. Lima (E2)', maxLength: 150 })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nomeOrigem!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacoes: string | null = null;
}

export class OutraContaMedicoDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 2147483647, example: 19053 })
  @Type(() => Number)
  @IsInt({ message: 'Informe o ID da conta na MobileMed, um número inteiro positivo.' })
  @Min(1, { message: 'Informe o ID da conta na MobileMed, um número inteiro positivo.' })
  @Max(2_147_483_647, { message: 'ID da MobileMed grande demais.' })
  idMobilemed!: number;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacao: string | null = null;
}

export class OutraContaMedicoItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: 'integer' }) idMobilemed!: number;
  @ApiProperty({ type: String, nullable: true }) observacao!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) criadoEm!: Date;
}

export class ReferenciaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
}

export class AliasMedicoItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nomeOrigem!: string;
  @ApiProperty({ enum: ORIGENS }) origem!: AliasMedico['origem'];
  @ApiProperty() verificadoManualmente!: boolean;
  @ApiProperty({ type: String, nullable: true }) observacoes!: string | null;
}

export class MedicoResumoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: String, nullable: true }) crm!: string | null;
  @ApiProperty({ type: 'integer', nullable: true }) idMobilemed!: number | null;
  @ApiProperty({ type: ReferenciaDto, nullable: true }) nivel!: ReferenciaDto | null;
  @ApiProperty({ enum: FUNCOES, nullable: true }) funcao!: FuncaoMedico | null;
  @ApiProperty() senior!: boolean;
  @ApiProperty() ativo!: boolean;
  @ApiProperty() ocultoDashboards!: boolean;
  @ApiProperty() totalAliases!: number;
}

export class MedicoDetalheDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: String, nullable: true }) crm!: string | null;
  @ApiProperty({ type: 'integer', nullable: true }) idMobilemed!: number | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) telefone!: string | null;
  @ApiProperty() ativo!: boolean;
  @ApiProperty() ocultoDashboards!: boolean;
  @ApiProperty() senior!: boolean;
  @ApiProperty() fellowship!: boolean;
  @ApiProperty({ enum: FUNCOES, nullable: true }) funcao!: FuncaoMedico | null;
  @ApiProperty({ type: ReferenciaDto, nullable: true }) nivel!: ReferenciaDto | null;
  @ApiProperty({ type: String, format: 'date', nullable: true }) dataInicioVinculo!: string | null;
  @ApiProperty({ type: String, nullable: true }) observacoes!: string | null;
  @ApiProperty({ type: [AliasMedicoItemDto] }) aliases!: AliasMedicoItemDto[];
  @ApiProperty({ type: [OutraContaMedicoItemDto], description: 'Contas além da principal.' })
  outrasContas!: OutraContaMedicoItemDto[];
  @ApiProperty({ type: [ReferenciaDto] }) equipes!: ReferenciaDto[];
}

export class PaginaMedicosDto {
  @ApiProperty({ type: [MedicoResumoDto] }) itens!: MedicoResumoDto[];
  @ApiProperty() total!: number;
  @ApiProperty() pagina!: number;
  @ApiProperty() porPagina!: number;
}
