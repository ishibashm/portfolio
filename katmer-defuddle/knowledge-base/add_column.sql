SET statement_timeout = 0;
ALTER TABLE "KnowledgeDocument" ADD COLUMN "extracted_keywords" TEXT[] DEFAULT ARRAY[]::TEXT[];