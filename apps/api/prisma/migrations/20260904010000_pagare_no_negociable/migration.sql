-- Cláusula "no a la orden" (art. 25 LGTOC). Repetible por la misma razón que la
-- migración anterior: se aplica a mano y el contenedor con el código nuevo puede
-- arrancar antes.

-- Los pagarés ya emitidos son negociables: es lo que dice el papel que se firmó,
-- y una migración no puede cambiar el texto de un documento firmado.
ALTER TABLE "PromissoryNote" ADD COLUMN IF NOT EXISTS "negotiable" BOOLEAN NOT NULL DEFAULT true;

-- La preferencia arranca apagada: nadie cambia la forma de sus pagarés sin decidirlo.
ALTER TABLE "OrganizationSettings" ADD COLUMN IF NOT EXISTS "issueNonNegotiable" BOOLEAN NOT NULL DEFAULT false;
