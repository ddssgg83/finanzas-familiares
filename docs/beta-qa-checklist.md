# RINDAY Beta QA Checklist

## Objetivo

Validar que RINDAY esta lista para una beta privada con usuarios reales, sin buscar perfeccion de lanzamiento publico.

## Pre-check

- Produccion abre en `https://rinday.app`.
- Login funciona con email/password.
- Reset password funciona.
- Magic link funciona si se usa.
- PWA no esta deshabilitada en Vercel.
- OpenAI API key existe solo server-side.
- Supabase service role no esta expuesto al cliente.

## Flujos principales

### Auth

- Crear cuenta nueva.
- Iniciar sesion.
- Cerrar sesion.
- Resetear password.
- Abrir app en otro dispositivo.

### Dashboard

- Ver metricas de ingresos, gastos y valor neto.
- Ver Premium Preview.
- Ver senales y proyeccion mensual.
- Ejecutar una accion del Copiloto.
- Confirmar que errores de IA no bloquean el dashboard.

### Gastos

- Crear ingreso.
- Crear gasto.
- Editar movimiento.
- Duplicar movimiento.
- Eliminar movimiento.
- Filtrar por tipo, categoria, metodo y busqueda.
- Generar PDF mensual.
- Exportar CSV.

### Offline / sync

- Desconectar internet.
- Crear movimiento offline.
- Confirmar indicador de pendiente.
- Reconectar.
- Confirmar que sincroniza.
- Confirmar que no duplica datos.

### Patrimonio

- Crear activo.
- Editar activo.
- Eliminar activo.
- Crear deuda.
- Editar deuda.
- Eliminar deuda.
- Confirmar totales.

### Familia

- Crear familia.
- Invitar miembro.
- Aceptar invitacion con email correcto.
- Confirmar roles owner/admin/member.
- Revocar o limpiar invitaciones si aplica.
- Confirmar que usuario sin permisos no ve acciones de admin.

### Metas familiares

- Crear meta familiar.
- Editar meta.
- Ver meta en dashboard familiar.
- Vincular movimiento a meta.
- Confirmar avance visible.

### Mobile / PWA

- Instalar en iOS.
- Instalar en Android/Chrome.
- Abrir standalone.
- Revisar safe-area y bottom nav.
- Revisar dark mode.
- Revisar pantallas con teclado abierto.

## Post-check

- Revisar Vercel logs.
- Revisar errores 401/500.
- Revisar que no haya errores visibles para usuarios.
- Capturar screenshots de los flujos principales.
- Registrar bugs en plantilla de feedback.

## Criterios go

- Auth y reset funcionan.
- Gastos online/offline funcionan.
- Familia e invitaciones funcionan.
- PDF funciona.
- Dashboard premium carga sin bloquear.
- No hay errores visibles recurrentes.

## Criterios no-go

- Usuarios no pueden iniciar sesion.
- Invitaciones no se aceptan.
- Movimientos se pierden o duplican.
- Offline rompe la app.
- Datos familiares aparecen a usuarios incorrectos.
- Produccion muestra errores tecnicos frecuentes.

