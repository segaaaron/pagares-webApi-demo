-- La tasa anual con cuatro decimales y cuatro dígitos enteros.
--
-- Dos motivos. Precisión: `accrueInterest` calcula con la tasa escalada por
-- 10 000, así que guardar dos decimales devolvía una tasa distinta de la que se
-- firmó. Rango: la pactada se multiplica por sus periodos —100 % quincenal son
-- 2 400 % anuales—, y `Decimal(5, 2)` topaba en 999.99, así que una tasa
-- quincenal por encima de 41.66 % reventaba con un error de base de datos.
--
-- Ensanchar no pierde nada: todo lo que cabía en (5,2) cabe en (8,4).

ALTER TABLE "PromissoryNote"
  ALTER COLUMN "interestRateAnnualPct" TYPE DECIMAL(8, 4);

-- El valor por defecto de Ajustes es la misma clase de dato y se copia al
-- emitir: dejarlo estrecho reintroducía el problema por la puerta de al lado.
ALTER TABLE "OrganizationSettings"
  ALTER COLUMN "defaultInterestRateAnnualPct" TYPE DECIMAL(8, 4);
