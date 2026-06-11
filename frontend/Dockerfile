# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar dependencias primero (caching de capas).
# Cache mount de BuildKit sobre /root/.npm: los paquetes descargados persisten
# entre builds → npm ci reutiliza la caché y no re-descarga.
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline

# Build arg para la URL de la API — en Docker usa ruta relativa (nginx proxy)
ARG  VITE_API_BASE_URL=/api/v1
ENV  VITE_API_BASE_URL=$VITE_API_BASE_URL

# Copiar código y compilar
COPY . .
RUN npm run build

# ── Etapa 2: Servir con nginx ──────────────────────────────────────────────
FROM nginx:1.25-alpine

# Copiar build de Vite al directorio de nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar configuración de nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Eliminar config default de nginx que interfiere
RUN rm -f /etc/nginx/conf.d/default.conf.bak

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]