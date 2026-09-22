-- Semente do plano de contas inicial (Paraguai). Modelo compartilhado: cada
-- tenant copia para o próprio `cuentas_plan` ao criar a primeira empresa.
--
-- ⚠️ Os tributos abaixo são exemplo ESTRUTURAL. Confirmar a lista real com o
-- contador do cliente antes de tratar como verdade fiscal.

INSERT INTO public.plantillas_plan_cuentas (nombre, pais)
VALUES ('Plan inicial Paraguay', 'PY')
ON CONFLICT (nombre) DO NOTHING;

WITH plantilla AS (SELECT id FROM public.plantillas_plan_cuentas WHERE nombre = 'Plan inicial Paraguay')
INSERT INTO public.plantillas_plan_cuentas_items (plantilla_id, codigo, descripcion, naturaleza, nivel)
SELECT plantilla.id, v.codigo, v.descripcion, v.naturaleza, 1
FROM plantilla CROSS JOIN (VALUES ('1', 'INGRESOS', 'R'), ('2', 'EGRESOS', 'D')) AS v(codigo, descripcion, naturaleza)
ON CONFLICT (plantilla_id, codigo) DO NOTHING;

WITH plantilla AS (SELECT id FROM public.plantillas_plan_cuentas WHERE nombre = 'Plan inicial Paraguay')
INSERT INTO public.plantillas_plan_cuentas_items (plantilla_id, codigo, descripcion, naturaleza, nivel, id_padre)
SELECT plantilla.id, v.codigo, v.descripcion, v.naturaleza, 2, padre.id
FROM plantilla
CROSS JOIN (VALUES
  ('1.1', 'Ventas', 'R', '1'), ('1.2', 'Ingresos Financieros', 'R', '1'), ('1.3', 'Otros Ingresos', 'R', '1'),
  ('2.1', 'Gastos de Personal', 'D', '2'), ('2.2', 'Gastos Administrativos', 'D', '2'), ('2.3', 'Gastos de Ventas', 'D', '2'),
  ('2.4', 'Gastos Tributarios', 'D', '2'), ('2.5', 'Gastos Financieros', 'D', '2')
) AS v(codigo, descripcion, naturaleza, codigo_padre)
JOIN public.plantillas_plan_cuentas_items padre ON padre.plantilla_id = plantilla.id AND padre.codigo = v.codigo_padre
ON CONFLICT (plantilla_id, codigo) DO NOTHING;

WITH plantilla AS (SELECT id FROM public.plantillas_plan_cuentas WHERE nombre = 'Plan inicial Paraguay')
INSERT INTO public.plantillas_plan_cuentas_items (plantilla_id, codigo, descripcion, naturaleza, nivel, id_padre)
SELECT plantilla.id, v.codigo, v.descripcion, v.naturaleza, 3, padre.id
FROM plantilla
CROSS JOIN (VALUES
  ('1.1.01', 'Venta de Productos', 'R', '1.1'), ('1.1.02', 'Venta de Servicios', 'R', '1.1'), ('1.1.03', 'Reventa de Mercaderías', 'R', '1.1'),
  ('1.2.01', 'Intereses Ganados', 'R', '1.2'), ('1.2.02', 'Descuentos Obtenidos', 'R', '1.2'), ('1.2.03', 'Rendimientos', 'R', '1.2'),
  ('1.3.01', 'Recupero de Gastos', 'R', '1.3'), ('1.3.02', 'Venta de Activos', 'R', '1.3'),
  ('2.1.01', 'Sueldos', 'D', '2.1'), ('2.1.02', 'Cargas Sociales (IPS)', 'D', '2.1'), ('2.1.03', 'Aguinaldo', 'D', '2.1'), ('2.1.04', 'Vacaciones', 'D', '2.1'),
  ('2.2.01', 'Alquiler', 'D', '2.2'), ('2.2.02', 'Energía Eléctrica (ANDE)', 'D', '2.2'), ('2.2.03', 'Agua (ESSAP)', 'D', '2.2'), ('2.2.04', 'Teléfono e Internet', 'D', '2.2'), ('2.2.05', 'Útiles de Oficina', 'D', '2.2'),
  ('2.3.01', 'Comisiones', 'D', '2.3'), ('2.3.02', 'Publicidad', 'D', '2.3'), ('2.3.03', 'Viáticos', 'D', '2.3'),
  ('2.4.01', 'IVA', 'D', '2.4'), ('2.4.02', 'IRE', 'D', '2.4'), ('2.4.03', 'Tasas Municipales', 'D', '2.4'),
  ('2.5.01', 'Intereses Pagados', 'D', '2.5'), ('2.5.02', 'Comisiones Bancarias', 'D', '2.5')
) AS v(codigo, descripcion, naturaleza, codigo_padre)
JOIN public.plantillas_plan_cuentas_items padre ON padre.plantilla_id = plantilla.id AND padre.codigo = v.codigo_padre
ON CONFLICT (plantilla_id, codigo) DO NOTHING;
