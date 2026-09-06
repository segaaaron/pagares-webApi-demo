-- El registro único de población del deudor, opcional.
--
-- Identifica mejor que el nombre —dos «Juan Pérez» no comparten CURP— y sirve
-- para reconocer a la misma persona entre fichas. Sin índice único: si dos
-- fichas lo comparten es un duplicado que hay que mirar, no una fila a rechazar.

ALTER TABLE "Debtor" ADD COLUMN "curp" TEXT;
CREATE INDEX "Debtor_curp_idx" ON "Debtor"("curp");
