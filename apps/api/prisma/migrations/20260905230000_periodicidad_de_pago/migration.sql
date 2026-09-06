-- Cada cuánto se paga: mensual o quincenal (§12).
--
-- Decide las fechas de las cuotas y el divisor de la tasa anual —doce o
-- veinticuatro—. Sin él, un plan quincenal cobraría el interés de un mes entero
-- cada quince días: el doble de lo pactado.

ALTER TYPE "InterestPeriod" ADD VALUE IF NOT EXISTS 'BIWEEKLY' BEFORE 'ANNUAL';

ALTER TABLE "PromissoryNote"
  ADD COLUMN "paymentFrequency" TEXT NOT NULL DEFAULT 'MONTHLY';
