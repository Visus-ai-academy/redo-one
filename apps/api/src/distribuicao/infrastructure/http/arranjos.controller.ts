import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import { ConsultarArranjos, SalvarArranjos } from '../../application/use-cases/arranjos';
import { DefinirRoboMedico, ObterRoboMedico } from '../../application/use-cases/robo-medico';
import { SugerirAlocacao } from '../../application/use-cases/sugerir-alocacao';
import { DefinirUsoEquipe, ObterUsoEquipe } from '../../application/use-cases/uso-equipe';
import {
  DistribuicaoEquipeDto,
  DistribuicaoMedicoDto,
  RespostaSugestaoAlocacaoDto,
  RoboMedicoDto,
  SalvarArranjosDto,
  SugestaoAlocacaoQueryDto,
  UsoEquipeDto,
} from './dto/arranjo.dto';

const usuario = (p: PrincipalUsuario) => ({ tipo: 'usuario' as const, id: p.usuarioId });

/** O que cada médico lauda (arranjos) e se o robô pode entregar exames a ele. */
@ApiTags('distribuicao')
@Controller('distribuicao/medicos/:medicoId')
export class DistribuicaoMedicoController {
  constructor(
    private readonly consultar: ConsultarArranjos,
    private readonly salvar: SalvarArranjos,
    private readonly obterRobo: ObterRoboMedico,
    private readonly definirRobo: DefinirRoboMedico,
  ) {}

  @Get()
  @Permissao('medicos.distribuicao.ver')
  @ApiOkResponse({ type: DistribuicaoMedicoDto })
  @ApiNotFoundResponse()
  async obter(@Param('medicoId', ParseUUIDPipe) medicoId: string): Promise<DistribuicaoMedicoDto> {
    const dono = { tipo: 'medico' as const, id: medicoId };
    const [arranjos, robo] = await Promise.all([
      this.consultar.executar(dono),
      this.obterRobo.executar(medicoId),
    ]);
    return { ...arranjos, ...robo };
  }

  @Put('arranjos')
  @Permissao('medicos.distribuicao.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  salvarArranjos(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('medicoId', ParseUUIDPipe) medicoId: string,
    @Body() corpo: SalvarArranjosDto,
  ): Promise<void> {
    return this.salvar.executar(usuario(ator), { tipo: 'medico', id: medicoId }, corpo.arranjos);
  }

  @Put('robo')
  @Permissao('medicos.distribuicao.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  salvarRobo(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('medicoId', ParseUUIDPipe) medicoId: string,
    @Body() corpo: RoboMedicoDto,
  ): Promise<void> {
    return this.definirRobo.executar(usuario(ator), medicoId, {
      habilitadoRobo: corpo.habilitadoRobo,
    });
  }
}

/**
 * Arranjos da equipe e o uso deles pelo robô: direcionar o recorte aos membros ou só tirá-lo do
 * robô (plantão).
 */
@ApiTags('distribuicao')
@Controller('distribuicao/equipes/:equipeId')
export class DistribuicaoEquipeController {
  constructor(
    private readonly consultar: ConsultarArranjos,
    private readonly salvar: SalvarArranjos,
    private readonly obterUso: ObterUsoEquipe,
    private readonly definirUso: DefinirUsoEquipe,
  ) {}

  @Get()
  @Permissao('medicos.distribuicao.ver')
  @ApiOkResponse({ type: DistribuicaoEquipeDto })
  @ApiNotFoundResponse()
  async obter(@Param('equipeId', ParseUUIDPipe) equipeId: string): Promise<DistribuicaoEquipeDto> {
    const [arranjos, uso] = await Promise.all([
      this.consultar.executar({ tipo: 'equipe', id: equipeId }),
      this.obterUso.executar(equipeId),
    ]);
    return { ...arranjos, ...uso };
  }

  @Put('arranjos')
  @Permissao('medicos.distribuicao.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  salvarArranjos(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('equipeId', ParseUUIDPipe) equipeId: string,
    @Body() corpo: SalvarArranjosDto,
  ): Promise<void> {
    return this.salvar.executar(usuario(ator), { tipo: 'equipe', id: equipeId }, corpo.arranjos);
  }

  @Put('uso')
  @Permissao('medicos.distribuicao.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  salvarUso(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('equipeId', ParseUUIDPipe) equipeId: string,
    @Body() corpo: UsoEquipeDto,
  ): Promise<void> {
    return this.definirUso.executar(usuario(ator), equipeId, { plantao: corpo.plantao });
  }
}

/**
 * Pré-preenchimento da alocação da escala. Fica com `escala.ver`: a gestora de escala aloca sem
 * acesso ao cadastro dos médicos, e só recebe os ids das prioridades e dos segmentos.
 */
@ApiTags('distribuicao')
@Controller('distribuicao/sugestao-alocacao')
export class SugestaoAlocacaoController {
  constructor(private readonly sugerir: SugerirAlocacao) {}

  @Get()
  @Permissao('escala.ver')
  @ApiOkResponse({ type: RespostaSugestaoAlocacaoDto })
  @ApiNotFoundResponse()
  async obter(@Query() q: SugestaoAlocacaoQueryDto): Promise<RespostaSugestaoAlocacaoDto> {
    return { sugestao: await this.sugerir.executar(q.medicoId, q.frenteId) };
  }
}
