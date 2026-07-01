-- Add missing scene reference schema and OSS-backed final output fields.

ALTER TABLE "shots" ADD COLUMN IF NOT EXISTS "scene_id" TEXT;

CREATE TABLE IF NOT EXISTS "scenes" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "episode_id" TEXT,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "scene_time" TEXT,
    "description" TEXT,
    "art_style" TEXT,
    "prompt" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "scene_images" (
    "id" TEXT NOT NULL,
    "scene_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "image_url" TEXT,
    "storage_object_key" TEXT,
    "storage_provider" TEXT,
    "source_url" TEXT,
    "prompt" TEXT,
    "negative_prompt" TEXT,
    "seed" TEXT,
    "model_name" TEXT,
    "params" JSONB DEFAULT '{}',
    "reference_type" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_selected" BOOLEAN NOT NULL DEFAULT false,
    "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scene_images_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "final_videos" ADD COLUMN IF NOT EXISTS "storage_object_key" TEXT;
ALTER TABLE "final_videos" ADD COLUMN IF NOT EXISTS "storage_provider" TEXT;
ALTER TABLE "final_videos" ADD COLUMN IF NOT EXISTS "source_video_url" TEXT;
ALTER TABLE "final_videos" ADD COLUMN IF NOT EXISTS "asset_package_object_key" TEXT;
ALTER TABLE "final_videos" ADD COLUMN IF NOT EXISTS "asset_package_storage_provider" TEXT;

CREATE INDEX IF NOT EXISTS "scenes_project_id_episode_id_idx" ON "scenes"("project_id", "episode_id");
CREATE INDEX IF NOT EXISTS "scenes_project_id_location_idx" ON "scenes"("project_id", "location");
CREATE INDEX IF NOT EXISTS "scene_images_project_id_scene_id_idx" ON "scene_images"("project_id", "scene_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scenes_project_id_fkey') THEN
    ALTER TABLE "scenes" ADD CONSTRAINT "scenes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scenes_episode_id_fkey') THEN
    ALTER TABLE "scenes" ADD CONSTRAINT "scenes_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scene_images_scene_id_fkey') THEN
    ALTER TABLE "scene_images" ADD CONSTRAINT "scene_images_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scene_images_project_id_fkey') THEN
    ALTER TABLE "scene_images" ADD CONSTRAINT "scene_images_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shots_scene_id_fkey') THEN
    ALTER TABLE "shots" ADD CONSTRAINT "shots_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
