import type { PoolClient } from 'pg';

export async function recordAudit(client: PoolClient, event: { tenantId: number; userCode: number; action: string; entity: string; entityId?: string | number; empresaId?: string | number | null; detail?: Record<string, unknown> }): Promise<void> {
  await client.query(
    `INSERT INTO auditoria_eventos (tenant_id, empresa_id, usuario_origem_codigo, accion, entidad, entidad_id, detalle)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [event.tenantId, event.empresaId ?? null, event.userCode, event.action, event.entity, event.entityId == null ? null : String(event.entityId), JSON.stringify(event.detail ?? {})],
  );
}
