-- Non-sensitive metadata only. No bearer tokens, WordPress passwords, post content or OAuth credentials.
CREATE TABLE IF NOT EXISTS mcp_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actor TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  target_id INTEGER,
  success INTEGER NOT NULL CHECK (success IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_time ON mcp_audit_events(event_time DESC);
