-- AddForeignKey
ALTER TABLE "document_stad_metadata" ADD CONSTRAINT "document_stad_metadata_request_type_id_fkey" FOREIGN KEY ("request_type_id") REFERENCES "stad_request_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
