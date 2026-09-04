-- Bitácora de custodia del pagaré en papel (§13.6), condonación del remanente
-- y su umbral (§25.16). Tres cosas que el sistema no sabía registrar.
--
-- Escrita para poder aplicarse DOS VECES sin romperse, y no por manía: las
-- migraciones se corren a mano desde el contenedor (docs/DEPLOY.md §4), que sólo
-- existe una vez desplegada la imagen nueva. Entre el arranque y la migración,
-- el código nuevo consultaría columnas que aún no están. Siendo repetible, el
-- SQL puede aplicarse ANTES contra la base —es sólo aditivo, el código viejo lo
-- ignora— y `prisma migrate deploy` después no hace nada salvo dejar constancia.

-- Qué clase de movimiento tuvo el documento físico. `CREATE TYPE` no admite
-- IF NOT EXISTS, así que se pregunta antes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CustodyEventKind') THEN
    CREATE TYPE "CustodyEventKind" AS ENUM ('RECEIVED', 'MOVED', 'HANDED_OVER', 'RETURNED', 'LOST');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "CustodyEvent" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "kind" "CustodyEventKind" NOT NULL,
    "occurredOn" DATE NOT NULL,
    "location" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "handedTo" TEXT,
    "notes" TEXT,
    "registeredBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustodyEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustodyEvent_noteId_occurredOn_idx" ON "CustodyEvent"("noteId", "occurredOn");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustodyEvent_noteId_fkey') THEN
    ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_noteId_fkey"
      FOREIGN KEY ("noteId") REFERENCES "PromissoryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- El asiento que cierra un pagaré por unos pesos de diferencia. Entra en el
-- libro para que el saldo cuadre, y se excluye de todo lo que cuenta caja.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "isWaiver" BOOLEAN NOT NULL DEFAULT false;

-- Cuánto se puede condonar. Cero deja la propuesta apagada: nadie condona nada
-- por omisión.
ALTER TABLE "OrganizationSettings" ADD COLUMN IF NOT EXISTS "settlementToleranceCents" BIGINT NOT NULL DEFAULT 0;
