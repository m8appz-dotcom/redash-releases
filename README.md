# ReDash — releases

Distribución pública de **ReDash** (dashcam sobre teléfonos Android). El código fuente vive en un
repositorio privado aparte; aquí solo se publican los APK firmados y el manifiesto de versión que
consume la auto-actualización de la app.

## Descargar

Página de descarga con instrucciones: **https://m8appz-dotcom.github.io/redash-releases/**
O directo desde [Releases](https://github.com/m8appz-dotcom/redash-releases/releases/latest).

Verifica siempre el `SHA-256` publicado antes de instalar.

## Cómo se publica una versión nueva

1. Se sube el APK firmado como asset de un GitHub Release nuevo, con tag `vX.Y.Z`.
2. Se actualiza [`version.json`](version.json) con el `versionCode`, `versionName`, `apkUrl` y `sha256`
   de esa versión.
3. La app, al abrir, lee `version.json` y ofrece la actualización si su `versionCode` es mayor.

El `versionCode` es la fuente de verdad para decidir si hay actualización — debe subir en cada release.
