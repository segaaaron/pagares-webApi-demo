-- El folio del recibo se guarda con el abono: reimprimir un recibo tiene que
-- devolver el mismo documento, no uno nuevo (§17.1).
ALTER TABLE "Payment" ADD COLUMN "receiptFolio" TEXT;

CREATE UNIQUE INDEX "Payment_receiptFolio_key" ON "Payment"("receiptFolio");
