# Tambo × inDrive Control Center

## Qué incluye
- Landing privada estilo dashboard web
- Overview del e-commerce total de Tambo
- Módulo del proyecto Tambo × inDrive
- Filtros agregativos multiselección
- Mapa de cobertura / demanda / prioridad
- Tabla ordenable por local
- Acceso privado por OTP por correo

## Dominios permitidos
- @getjusto.com
- @indriver.com
- @lindcorp.pe

## Variables de entorno en Netlify
Crea estas variables en Netlify:
- `AUTH_SECRET` = una cadena larga y privada
- `RESEND_API_KEY` = tu API key de Resend
- `OTP_FROM_EMAIL` = remitente validado en Resend, por ejemplo `Control Center <noreply@tudominio.com>`

## Despliegue rápido
1. Sube esta carpeta a GitHub o haz drag-and-drop a Netlify.
2. En Netlify, agrega las variables de entorno.
3. Vuelve a desplegar.
4. Entra a la URL del sitio y solicita el código al correo corporativo.

## Notas
- El sitio no expone la data en un archivo público; la data se entrega desde una Function protegida por token.
- Para el envío del OTP se usa Resend desde una Netlify Function.
- La cartografía usa OpenStreetMap / Leaflet y coordenadas aproximadas por distrito/ciudad para una experiencia rápida y estable.
