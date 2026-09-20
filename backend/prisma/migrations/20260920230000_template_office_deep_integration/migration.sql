ALTER TABLE "office_documents"
  ADD COLUMN "source_template_id" CHAR(36),
  ADD COLUMN "source_template_version_id" CHAR(36);

CREATE INDEX "office_documents_org_id_source_template_id_idx"
  ON "office_documents"("org_id", "source_template_id");

CREATE INDEX "office_documents_source_template_id_source_template_version_id_idx"
  ON "office_documents"("source_template_id", "source_template_version_id");
