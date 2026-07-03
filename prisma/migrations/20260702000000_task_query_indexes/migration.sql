CREATE INDEX IF NOT EXISTS "generation_tasks_status_type_created_at_idx"
  ON "generation_tasks" ("status", "task_type", "created_at");

CREATE INDEX IF NOT EXISTS "generation_tasks_project_updated_at_idx"
  ON "generation_tasks" ("project_id", "updated_at");

CREATE INDEX IF NOT EXISTS "generation_tasks_project_created_at_idx"
  ON "generation_tasks" ("project_id", "created_at");

CREATE INDEX IF NOT EXISTS "task_logs_task_created_at_idx"
  ON "task_logs" ("task_id", "created_at");
