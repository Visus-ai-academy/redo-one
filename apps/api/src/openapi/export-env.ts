// Importado antes de tudo no export.ts: a validação do ambiente roda ao importar o AppModule, e o
// export não acessa o banco (o pool só conecta na primeira query). A URL fictícia só a satisfaz.
process.env.DATABASE_URL ??= 'postgresql://openapi-export@localhost/openapi';
