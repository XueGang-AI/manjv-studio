-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."asset_files" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."character_images" (
    "id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "image_url" TEXT,
    "prompt" TEXT,
    "negative_prompt" TEXT,
    "seed" TEXT,
    "model_name" TEXT,
    "params" JSONB DEFAULT '{}',
    "is_selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "reference_type" TEXT,

    CONSTRAINT "character_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."characters" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT,
    "gender" TEXT,
    "age" INTEGER,
    "role_type" TEXT,
    "identity" TEXT,
    "appearance" JSONB DEFAULT '{}',
    "clothing" JSONB DEFAULT '{}',
    "personality" JSONB DEFAULT '{}',
    "signature_features" JSONB DEFAULT '[]',
    "language_style" JSONB DEFAULT '{}',
    "action_habits" JSONB DEFAULT '[]',
    "emotional_arc" TEXT,
    "zh_fixed_prompt" TEXT,
    "en_fixed_prompt" TEXT,
    "reference_style" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."episodes" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "episode_no" INTEGER NOT NULL,
    "title" TEXT,
    "duration" INTEGER,
    "outline" TEXT,
    "core_task" TEXT,
    "emotion_curve" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "ending_hook" TEXT,
    "opening_hook" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."final_videos" (
    "id" TEXT NOT NULL,
    "episode_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "video_url" TEXT,
    "cover_url" TEXT,
    "subtitle_url" TEXT,
    "asset_package_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "aspect_ratio" TEXT,
    "duration" DOUBLE PRECISION,
    "fps" INTEGER,

    CONSTRAINT "final_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."generation_tasks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "episode_id" TEXT,
    "shot_id" TEXT,
    "task_type" TEXT NOT NULL,
    "model_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB DEFAULT '{}',
    "output" JSONB DEFAULT '{}',
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "started_at" TIMESTAMP(3),

    CONSTRAINT "generation_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."image_prompts" (
    "id" TEXT NOT NULL,
    "shot_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "zh_prompt" TEXT,
    "en_prompt" TEXT,
    "negative_prompt" TEXT,
    "consistency_keywords" TEXT,
    "aspect_ratio" TEXT,
    "style" TEXT,
    "seed" TEXT,
    "params" JSONB DEFAULT '{}',
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."model_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "base_url" TEXT,
    "api_key" TEXT,
    "model_name" TEXT NOT NULL,
    "params" JSONB DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."project_versions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "change_type" TEXT NOT NULL DEFAULT 'GENERATE',
    "description" TEXT,
    "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "source_task_id" TEXT,

    CONSTRAINT "project_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."projects" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_name" TEXT NOT NULL,
    "story_type" TEXT,
    "background" TEXT,
    "main_characters" JSONB,
    "core_conflict" TEXT,
    "story_summary" TEXT,
    "full_story" TEXT,
    "art_style" TEXT,
    "target_platform" TEXT,
    "episode_count" INTEGER NOT NULL DEFAULT 10,
    "episode_duration" INTEGER NOT NULL DEFAULT 90,
    "aspect_ratio" TEXT NOT NULL DEFAULT '9:16',
    "audience" TEXT,
    "ending_type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "model_provider" TEXT NOT NULL DEFAULT 'ark',

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."prompt_template_versions" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "changes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."prompt_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "template" TEXT NOT NULL DEFAULT '',
    "output_schema" JSONB,
    "variables" JSONB DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "source_file" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."qc_reports" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "score" INTEGER,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "issues" JSONB DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qc_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."shot_images" (
    "id" TEXT NOT NULL,
    "shot_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "image_url" TEXT,
    "prompt_id" TEXT,
    "model_name" TEXT,
    "params" JSONB DEFAULT '{}',
    "is_selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aspect_ratio" TEXT,
    "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "negative_prompt" TEXT,
    "prompt" TEXT,
    "reference_images" JSONB DEFAULT '[]',
    "seed" TEXT,
    "style" TEXT,

    CONSTRAINT "shot_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."shot_videos" (
    "id" TEXT NOT NULL,
    "shot_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "input_image_url" TEXT,
    "video_url" TEXT,
    "prompt_id" TEXT,
    "model_name" TEXT,
    "duration" DOUBLE PRECISION,
    "params" JSONB DEFAULT '{}',
    "is_selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "prompt" TEXT,
    "reference_images" JSONB DEFAULT '[]',
    "seed" TEXT,
    "last_polled_at" TIMESTAMP(3),
    "remote_progress" INTEGER,
    "remote_response_json" JSONB,
    "remote_status" TEXT,
    "remote_task_id" TEXT,

    CONSTRAINT "shot_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."shots" (
    "id" TEXT NOT NULL,
    "episode_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "shot_no" INTEGER NOT NULL,
    "shot_name" TEXT,
    "start_time" DOUBLE PRECISION,
    "end_time" DOUBLE PRECISION,
    "scene_time" TEXT,
    "location" TEXT,
    "characters" JSONB DEFAULT '[]',
    "action" TEXT,
    "details" TEXT,
    "camera" JSONB DEFAULT '{}',
    "visual" JSONB DEFAULT '{}',
    "emotion" TEXT,
    "sfx" TEXT,
    "bgm" TEXT,
    "dialogue" TEXT,
    "purpose" TEXT,
    "technical_notes" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."story_packages" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL DEFAULT '{}',
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."task_logs" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "message" TEXT,
    "detail" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB DEFAULT '{}',

    CONSTRAINT "task_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."video_prompts" (
    "id" TEXT NOT NULL,
    "shot_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "prompt" TEXT,
    "duration" DOUBLE PRECISION,
    "motion_strength" TEXT,
    "camera_motion" TEXT,
    "character_motion" TEXT,
    "environment_motion" TEXT,
    "negative_prompt" TEXT,
    "params" JSONB DEFAULT '{}',
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."voice_scripts" (
    "id" TEXT NOT NULL,
    "episode_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "content" JSONB DEFAULT '{}',
    "srt_url" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_scripts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "model_configs_name_key" ON "public"."model_configs"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_name_key" ON "public"."prompt_templates"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- AddForeignKey
ALTER TABLE "public"."asset_files" ADD CONSTRAINT "asset_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."character_images" ADD CONSTRAINT "character_images_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."character_images" ADD CONSTRAINT "character_images_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."characters" ADD CONSTRAINT "characters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."episodes" ADD CONSTRAINT "episodes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."final_videos" ADD CONSTRAINT "final_videos_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."final_videos" ADD CONSTRAINT "final_videos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."generation_tasks" ADD CONSTRAINT "generation_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."image_prompts" ADD CONSTRAINT "image_prompts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."image_prompts" ADD CONSTRAINT "image_prompts_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_versions" ADD CONSTRAINT "project_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."prompt_template_versions" ADD CONSTRAINT "prompt_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."prompt_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."qc_reports" ADD CONSTRAINT "qc_reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shot_images" ADD CONSTRAINT "shot_images_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shot_images" ADD CONSTRAINT "shot_images_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "public"."image_prompts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shot_images" ADD CONSTRAINT "shot_images_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shot_videos" ADD CONSTRAINT "shot_videos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shot_videos" ADD CONSTRAINT "shot_videos_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "public"."video_prompts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shot_videos" ADD CONSTRAINT "shot_videos_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shots" ADD CONSTRAINT "shots_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shots" ADD CONSTRAINT "shots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."story_packages" ADD CONSTRAINT "story_packages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_logs" ADD CONSTRAINT "task_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."generation_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."video_prompts" ADD CONSTRAINT "video_prompts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."video_prompts" ADD CONSTRAINT "video_prompts_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."voice_scripts" ADD CONSTRAINT "voice_scripts_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."voice_scripts" ADD CONSTRAINT "voice_scripts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
