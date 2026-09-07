-- La tasa ordinaria del plan se pactaba y se usaba para armar la tabla, pero no
-- se guardaba: al leer el pagaré las pantallas caían en la moratoria y
-- enseñaban el mismo número para dos pactos distintos (art. 174 LGTOC).
-- Nula en los pagarés ya emitidos: no se inventa una tasa que nadie firmó.
ALTER TABLE "PromissoryNote" ADD COLUMN "planRateAnnualPct" DECIMAL(8,4);
ALTER TABLE "PromissoryNote" ADD COLUMN "planRatePeriod" "InterestPeriod";

-- Los pagarés ya emitidos con plan sí tienen tasa ordinaria: es la misma que se
-- capturó, porque el formulario manda un solo número a los dos pactos. Se copia
-- para que sigan diciendo a qué precio se prestaron; los de pago único o sin
-- plan se quedan nulos, que es lo que son.
UPDATE "PromissoryNote"
   SET "planRateAnnualPct" = "interestRateAnnualPct",
       "planRatePeriod"    = "interestPeriod"
 WHERE "planModel" IS NOT NULL
   AND "planModel" <> 'NONE'
   AND "interestRateAnnualPct" IS NOT NULL;
