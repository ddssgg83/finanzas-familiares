# RINDAY Beta Demo Playbook

## Objetivo

Mostrar RINDAY como un copiloto financiero familiar: una app que une movimientos, patrimonio, metas, familia, reportes y señales inteligentes en una experiencia clara y premium.

## Preparacion pre-demo

- Usar una cuenta demo con datos cargados, no una cuenta vacia.
- Confirmar que la app abre en `https://rinday.app`.
- Confirmar que el icono PWA y el header muestran la identidad RINDAY actual.
- Confirmar que el copiloto responde con OpenAI activo.
- Generar un PDF antes de la demo para validar que no falla.
- Tener una segunda ruta lista si falla internet: dashboard, patrimonio y offline/sync.

## Demo flow sugerido

1. Abrir RINDAY como PWA o en viewport mobile.
2. Mostrar dashboard principal: salud financiera, siguiente accion, riesgos, senales y proyeccion.
3. Abrir Copiloto financiero y usar `Dame 3 acciones`.
4. Ir a Gastos: mostrar KPIs, tarjetas, vista familiar y boton `Reporte PDF`.
5. Generar o abrir un PDF mensual.
6. Ir a Patrimonio: mostrar activos, deudas y valor neto.
7. Ir a Familia: mostrar miembros, roles e invitaciones.
8. Ir a Metas familiares: mostrar avance y vinculacion con movimientos.
9. Cerrar con PWA/offline: RINDAY funciona aunque la conexion no sea perfecta.

## Frases clave

- "RINDAY no es solo registro de gastos; es una vista financiera familiar."
- "El copiloto no es chat libre: explica senales ya calculadas con tus datos."
- "La familia puede compartir contexto sin mezclar todo lo personal."
- "El PDF convierte el mes en un reporte claro para conversar y decidir."
- "Offline no es un extra tecnico; es confianza para capturar en la vida real."

## Que ensenar

- Dashboard premium con datos reales o demo realistas.
- Copiloto guiado.
- PDF mensual.
- Patrimonio con activos y deudas.
- Familia con owner/admin/member.
- Metas familiares con avance.
- PWA instalada o mobile-first.

## Que NO ensenar

- Cuenta vacia.
- Supabase, Vercel, logs o DevTools.
- Migraciones, RLS o detalles internos.
- Flujo largo de signup en vivo.
- Invitaciones por correo sin ensayo previo.
- Modulo Aprende salvo que lo pidan.
- Tablas densas por demasiado tiempo.

## Escenarios de falla

- Si OpenAI falla: mostrar senales locales y decir que la IA es on-demand, no bloquea el dashboard.
- Si el PDF tarda: usar un PDF generado previamente.
- Si falla una invitacion: explicar que el link puede compartirse manualmente y seguir con familia.
- Si no hay internet: mostrar offline/sync y capturar un movimiento local.
- Si aparece una cuenta vacia: cambiar a la cuenta demo antes de continuar.

## Cierre recomendado

Terminar con tres ideas:

- RINDAY da claridad financiera familiar.
- Ya tiene base tecnica para uso real: PWA, offline, familia, reportes e IA guiada.
- La beta privada busca validar habitos, lenguaje, confianza y utilidad semanal.

