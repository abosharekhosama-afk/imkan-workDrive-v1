CREATE TYPE "ExternalStorageStatus" AS ENUM ('ACTIVE', 'DISCONNECTED', 'ERROR');

CREATE TABLE "external_storage_mounts" (
  "id" CHAR(36) NOT NULL,
  "org_id" CHAR(36) NOT NULL,
  "user_id" CHAR(36) NOT NULL,
  "connection_id" CHAR(36) NOT NULL,
  "provider" VARCHAR(80) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "root_path" TEXT,
  "read_enabled" BOOLEAN NOT NULL DEFAULT true,
  "write_enabled" BOOLEAN NOT NULL DEFAULT false,
  "status" "ExternalStorageStatus" NOT NULL DEFAULT 'ACTIVE',
  "last_tested_at" TIMESTAMP(3),
  "last_test_ok" BOOLEAN,
  "last_test_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "external_storage_mounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "external_storage_mounts_org_id_user_id_name_key" ON "external_storage_mounts"("org_id","user_id","name");
CREATE INDEX "external_storage_mounts_org_id_user_id_provider_idx" ON "external_storage_mounts"("org_id","user_id","provider");
CREATE INDEX "external_storage_mounts_connection_id_status_idx" ON "external_storage_mounts"("connection_id","status");
ALTER TABLE "external_storage_mounts" ADD CONSTRAINT "external_storage_mounts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_storage_mounts" ADD CONSTRAINT "external_storage_mounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_storage_mounts" ADD CONSTRAINT "external_storage_mounts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
