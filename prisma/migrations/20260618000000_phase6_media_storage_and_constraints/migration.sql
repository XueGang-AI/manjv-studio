-- AlterTable
ALTER TABLE "character_images" ADD COLUMN     "source_url" TEXT,
ADD COLUMN     "storage_object_key" TEXT,
ADD COLUMN     "storage_provider" TEXT;

-- AlterTable
ALTER TABLE "shot_images" ADD COLUMN     "source_url" TEXT,
ADD COLUMN     "storage_object_key" TEXT,
ADD COLUMN     "storage_provider" TEXT;

-- AlterTable
ALTER TABLE "shot_videos" ADD COLUMN     "client_request_id" TEXT,
ADD COLUMN     "source_video_url" TEXT,
ADD COLUMN     "storage_object_key" TEXT,
ADD COLUMN     "storage_provider" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "video_prompts_shot_id_key" ON "video_prompts"("shot_id");

-- CreateIndex
CREATE UNIQUE INDEX "shot_videos_project_id_shot_id_client_request_id_key" ON "shot_videos"("project_id", "shot_id", "client_request_id");

