# RINDAY Beta Known Issues

## Objetivo

Mantener una lista corta y honesta de riesgos conocidos durante beta privada. Esta lista no reemplaza el backlog; sirve para soporte y demos.

## Known issues actuales

### Warnings de hooks en lint

Estado: conocido, no bloqueante.

`npm run lint` puede mostrar warnings de dependencias en hooks en `familia/page.tsx` y `gastos/page.tsx`.

Impacto: no bloquea build ni uso actual.

Accion: revisar despues de beta o en una fase tecnica dedicada.

### PWA puede aparecer deshabilitada en local

Estado: esperado.

Durante `npm run build` local puede aparecer `(pwa) PWA support is disabled`.

Impacto: no necesariamente afecta produccion.

Accion: confirmar variables de Vercel antes de beta.

### Copiloto depende de internet y OpenAI

Estado: esperado.

Si OpenAI falla o no hay conexion, las senales locales siguen visibles.

Impacto: el dashboard no debe bloquearse.

Accion: en demo, tener una respuesta o screenshot preparado como respaldo.

### Invitaciones por email dependen de proveedor externo

Estado: esperado.

El flujo puede funcionar aunque el correo no se entregue, usando link manual.

Impacto: puede requerir soporte manual.

Accion: probar una invitacion real antes de cada demo importante.

### Cuentas vacias reducen el impacto visual

Estado: conocido.

RINDAY se entiende mejor con datos reales o demo realistas.

Impacto: afecta percepcion en demo.

Accion: usar cuenta demo precargada para inversionistas y screenshots.

## Proceso de soporte beta

1. Recibir feedback con la plantilla.
2. Clasificar severidad.
3. Reproducir en cuenta interna o demo.
4. Revisar si hay workaround.
5. Resolver primero CRITICO y ALTO.
6. Agrupar UX/BAJO para polish semanal.
7. Avisar al usuario cuando el caso quede corregido o pospuesto.

## Prioridad durante beta

1. Seguridad y privacidad.
2. Perdida o duplicacion de datos.
3. Auth e invitaciones.
4. Offline/sync.
5. Gastos, patrimonio y metas.
6. Copiloto/PDF.
7. Polish visual.

## Que no se debe cambiar durante beta sin decision explicita

- DB schema.
- RLS.
- Migraciones.
- Auth core.
- Sync/offline core.
- Modelo familiar.
- Logica financiera central.

