# 0003. Modo de firma «papel» para la cartera importada

Fecha: 2026-09-03 · Estado: aceptada

## Contexto

§24.5 pide importar la cartera que ya existe. Esos pagarés están firmados en tinta, pero
`SignatureMode` sólo conocía `REMOTE` e `IN_PERSON`, y el estado se deriva de si hay firma
(§11.2): sin firma digital, los importados aparecerían «por firmar» para siempre y
entrarían en la cola de pendientes de Hoy.

## Decisión

Se añade `SignatureMode.PAPER`. Un pagaré con ese modo cuenta como firmado a efectos de
derivación de estado, y **no** genera certificado de evidencia.

## Alternativas descartadas

- **Fabricar una firma digital al importar**: convertiría el certificado de evidencia en
  un documento que certifica algo que no ocurrió, y con él perdería valor el de todos los
  demás (§24.1).
- **Una bandera `imported` aparte del modo de firma**: dos campos para responder a la
  misma pregunta —cómo se firmó esto— y la derivación tendría que mirar los dos.

## Consecuencias

La evidencia distingue tres formas de firmar y el certificado dice «en papel, anterior al
sistema: sin trazo digital». Un pagaré importado se puede cobrar, prorrogar y castigar
como cualquier otro, pero no se puede presentar como firmado electrónicamente, que es
exactamente la verdad.
