CREATE TYPE "OfficeEmailProvider" AS ENUM ('SENDGRID', 'GMAIL');

CREATE TABLE "office_email_settings" (
  "id" CHAR(36) NOT NULL,
  "org_id" CHAR(36) NOT NULL,
  "provider" "OfficeEmailProvider" NOT NULL,
  "connection_id" CHAR(36) NOT NULL,
  "from_email" TEXT NOT NULL,
  "from_name" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updated_by_id" CHAR(36) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "office_email_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "office_email_settings_org_id_key" ON "office_email_settings"("org_id");
CREATE INDEX "office_email_settings_org_id_updated_at_idx" ON "office_email_settings"("org_id", "updated_at");
ALTER TABLE "office_email_settings" ADD CONSTRAINT "office_email_settings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "office_email_settings" ADD CONSTRAINT "office_email_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
