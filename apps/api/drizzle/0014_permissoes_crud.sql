-- Permissões CRUD por tela: converte as chaves antigas dos papéis para as novas (só dados).
-- Idempotente: as novas entram com "on conflict do nothing" e só saem as chaves que deixaram de
-- existir. `X.editar` dos cadastros continua valendo e ganha criar e excluir.
insert into "papeis_permissoes" ("papel_id", "permissao")
select pp."papel_id", c."nova"
from "papeis_permissoes" pp
join (
  values
    ('clientes.editar', 'clientes.criar'),
    ('clientes.editar', 'clientes.excluir'),
    ('medicos.editar', 'medicos.criar'),
    ('medicos.editar', 'medicos.excluir'),
    ('exames.editar', 'exames.criar'),
    ('exames.editar', 'exames.excluir'),
    ('catalogo.editar', 'catalogo.criar'),
    ('catalogo.editar', 'catalogo.excluir'),
    ('de-para.editar', 'de-para.criar'),
    ('de-para.editar', 'de-para.excluir'),
    ('contratos.editar', 'contratos.criar'),
    ('contratos.editar', 'contratos.excluir'),
    ('papeis.editar', 'papeis.criar'),
    ('papeis.editar', 'papeis.excluir'),
    ('escala-config.editar', 'escala-config.criar'),
    ('escala-config.editar', 'escala-config.excluir'),
    ('importacao.enviar', 'importacao.criar'),
    ('escala.alocacao.editar', 'escala.criar'),
    ('escala.alocacao.editar', 'escala.editar'),
    ('escala.alocacao.editar', 'escala.excluir'),
    ('escala.ver', 'ausencias.ver'),
    ('escala.ausencia.editar', 'ausencias.ver'),
    ('escala.ausencia.editar', 'ausencias.criar'),
    ('escala.ausencia.editar', 'ausencias.editar'),
    ('escala.ausencia.editar', 'ausencias.excluir'),
    ('escala.ausencia.editar', 'ausencias.observacoes.ver'),
    ('escala.ausencia.aprovar', 'ausencias.ver'),
    ('escala.ausencia.aprovar', 'ausencias.aprovar'),
    ('escala.ausencia.aprovar', 'ausencias.observacoes.ver'),
    ('escala.historico.ver', 'escala-historico.ver'),
    ('usuarios.convidar', 'usuarios.criar')
) as c ("antiga", "nova") on c."antiga" = pp."permissao"
on conflict do nothing;
--> statement-breakpoint
delete from "papeis_permissoes"
where "permissao" in (
  'importacao.enviar',
  'escala.alocacao.editar',
  'escala.ausencia.editar',
  'escala.ausencia.aprovar',
  'escala.historico.ver',
  'usuarios.convidar'
);
