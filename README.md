# Corroborador de Pagos

Cuando un comercio recibe un cobro en Mercado Pago, sus cajas lo ven al instante y lo confirman, sin fotos de comprobantes.

- Cada comercio tiene su cuenta y solo ve sus cobros.
- El comercio conecta Mercado Pago con un botón (OAuth), sin copiar claves.
- Un cobro solo aparece si Mercado Pago lo confirma, consultado con el token del propio comercio. El aviso (webhook) nunca crea un pago por sí solo.
- Los pagos entran por webhook y, además, por consulta periódica mientras haya una pantalla abierta.

## Puesta en marcha (una sola vez, la hace el operador)

Si falta algo, la app muestra en pantalla qué variable falta. Todas están explicadas en `.env.example`.

1. **Aplicación en Mercado Pago Developers.** Creá una sola aplicación y activá sus credenciales de producción.
   - URL de redirección: `https://TU-APP/api/auth/mercadopago/callback`
   - Webhooks, modo productivo: `https://TU-APP/api/webhooks/mercadopago`, evento **Pagos**.
   - Copiá Client ID, Client Secret y la Firma secreta del webhook.
2. **Firebase.** Creá el proyecto y la base Firestore. En *Cuentas de servicio*, generá una clave privada: ese JSON va en `FIREBASE_SERVICE_ACCOUNT`.
3. **Variables.** Cargá `APP_URL`, `APP_SECRET`, las tres de Mercado Pago, `REGISTRATION_CODE` y `FIREBASE_SERVICE_ACCOUNT`.
4. **Publicá** la app. OAuth y webhook necesitan la URL pública: no funcionan en la vista previa.

## Para cada cliente

1. Le das la URL y el `REGISTRATION_CODE`; crea su cuenta.
2. Toca **Conectar con Mercado Pago** y autoriza.
3. En **Compartir con Vendedores** obtiene el enlace o QR para sus cajas.

**Suspender a un cliente:** en Firestore, `merchants/{id}`, poné `active` en `false`.

**Restablecer una contraseña:** `npx tsx scripts/reset-password.ts email@comercio.com "ClaveNueva123"`, con las mismas variables de entorno.

## Desarrollo

```
npm install
npm run dev     # datos en data/, ignorada por git
npm test
```

Fuera de producción los datos van a un archivo local y existe el pago simulado, siempre rotulado como simulación. Sin `MERCADOPAGO_CLIENT_ID` y `MERCADOPAGO_CLIENT_SECRET` no se puede conectar una cuenta.
