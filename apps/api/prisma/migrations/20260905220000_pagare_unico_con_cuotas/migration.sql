-- Un pagaré, un folio, su tabla de amortización (ADR 0022).
--
-- Muere la serie: doce mensualidades dejan de ser doce títulos y pasan a ser un
-- título con doce cuotas. Los arts. 17 y 130 LGTOC contemplan el pago en abonos
-- sobre un mismo documento, y es lo que hacen aquí las financieras.

DROP INDEX IF EXISTS "PromissoryNote_seriesId_seriesIndex_idx";

ALTER TABLE "PromissoryNote"
  DROP COLUMN IF EXISTS "seriesId",
  DROP COLUMN IF EXISTS "seriesIndex",
  DROP COLUMN IF EXISTS "seriesSize";

CREATE TABLE "NoteInstallment" (
  "id" TEXT NOT NULL,
  "noteId" TEXT NOT NULL,
  "index" INTEGER NOT NULL,
  "dueOn" DATE NOT NULL,
  "amountCents" BIGINT NOT NULL,
  "interestCents" BIGINT NOT NULL DEFAULT 0,
  "principalCents" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NoteInstallment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NoteInstallment_noteId_index_key" ON "NoteInstallment"("noteId", "index");
CREATE INDEX "NoteInstallment_noteId_dueOn_idx" ON "NoteInstallment"("noteId", "dueOn");

ALTER TABLE "NoteInstallment"
  ADD CONSTRAINT "NoteInstallment_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "PromissoryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
