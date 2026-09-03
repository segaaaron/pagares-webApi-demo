# 0004. Registro de entregas y webhook firmado

Fecha: 2026-09-03 · Estado: aceptada

## Contexto

§16 promete que «se guarda el `messageId` y el webhook de Resend actualiza el estado de
entrega». No existía ni la tabla ni el endpoint: un rebote no se enteraba nadie, que es
uno de los riesgos declarados en §22.5.

## Decisión

Cada envío se anota en `EmailDelivery` con su `messageId`, plantilla y pagaré, mediante un
decorador del puerto `Mailer`. `POST /webhooks/resend` verifica la firma HMAC del cuerpo
crudo (protocolo Svix) y actualiza el estado; sin secreto configurado responde 503.

## Alternativas descartadas

- **Anotar dentro de `ResendMailer`**: mezcla hablar con el proveedor y llevar el
  historial; al cambiar de proveedor se llevaría por delante el registro.
- **Aceptar el webhook sin verificar**: cualquiera que conozca la URL podría marcar como
  entregado un correo que nunca salió.
- **Reserializar el JSON para verificar**: el HMAC se calcula sobre los bytes que llegaron;
  reordenar una clave lo invalida.

## Consecuencias

El detalle del pagaré puede decir si el aviso salió, se entregó o rebotó. El proceso
arranca con `rawBody: true` para conservar el cuerpo original. Un fallo al escribir la fila
no tumba el envío: el correo ya salió, y decir lo contrario sería peor que no anotarlo.
