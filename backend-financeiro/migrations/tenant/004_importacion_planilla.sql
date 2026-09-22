-- =============================================================================
-- 004 — Importación de planilla (carga inicial)
-- La tabla documentos_importados nació para XML SIFEN y extractos; la carga
-- inicial por planilla también se registra ahí (hash del archivo = candado
-- contra doble importación del mismo archivo).
-- Idempotente: puede correrse más de una vez sin efecto.
-- =============================================================================

ALTER TABLE documentos_importados
  DROP CONSTRAINT IF EXISTS documentos_importados_tipo_check;

ALTER TABLE documentos_importados
  ADD CONSTRAINT documentos_importados_tipo_check
  CHECK (tipo IN ('XML_COMPRA', 'EXTRACTO_BANCARIO', 'PLANILLA'));
