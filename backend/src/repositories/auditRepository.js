import { query } from "../db/pool.js";

export async function recordAudit({ actorId = null, action, resourceType, resourceId = null, metadata = {}, requestId = null, ip = null }, client = null) {
  const runner = client || { query };
  await runner.query(
    `INSERT INTO audit_events (actor_id, action, resource_type, resource_id, metadata, request_id, ip)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [actorId, action, resourceType, resourceId, JSON.stringify(metadata), requestId, ip],
  );
}
