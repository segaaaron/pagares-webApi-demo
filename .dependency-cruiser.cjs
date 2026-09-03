const path = require('node:path');

/**
 * Regla de dependencias de §1 y §7, verificada en CI.
 * El dominio no conoce framework, ORM, cola ni la web. Si alguien lo rompe,
 * el build falla — no depende de que un revisor lo note.
 */
module.exports = {
  forbidden: [
    {
      name: 'dominio-puro',
      severity: 'error',
      comment: 'domain/ no puede importar NestJS, Prisma, Redis, sharp ni la app web',
      from: { path: '(^|/)domain/' },
      to: { path: '@nestjs|@prisma/client|ioredis|bullmq|sharp|express|apps/web' },
    },
    {
      name: 'aplicacion-sin-infraestructura',
      severity: 'error',
      comment: 'application/ orquesta; no habla con Prisma ni con HTTP directamente',
      from: { path: '(^|/)application/' },
      to: { path: '@prisma/client|express|@nestjs/platform' },
    },
    {
      name: 'sin-modulos-cruzados',
      severity: 'error',
      comment: 'Un módulo no importa la infraestructura de otro (§3.2)',
      from: { path: 'apps/api/src/modules/([^/]+)/' },
      to: { path: 'apps/api/src/modules/(?!$1)[^/]+/infrastructure/' },
    },
    { name: 'sin-circulares', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'sin-huerfanos',
      severity: 'warn',
      comment: 'Archivo que nadie importa. Los puntos de entrada están exentos.',
      from: {
        orphan: true,
        pathNot: '(\\.d\\.ts$)|(\\.config\\.(m|c)?(j|t)s$)|(/src/index\\.ts$)|(/src/main\\.ts$)|(/app/.*\\.tsx$)',
      },
      to: {},
    },
  ],
  options: {
    // El alias `@/` de apps/web se resuelve con su tsconfig; sin esto, sus
    // módulos parecerían huérfanos y el aviso dejaría de significar algo.
    tsConfig: { fileName: path.join(__dirname, 'apps/web/tsconfig.json') },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(dist|\\.next|coverage)/' },
    tsPreCompilationDeps: true,
  },
};
