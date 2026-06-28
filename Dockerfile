# ─── AcademyFlow Frontend ──────────────────────────────────────────────────────
# Stage 1: build the static Vite/React app.
# Stage 2: serve it with nginx, proxying /api to the backend container.

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# VITE_API_URL is empty/unset on purpose for Docker: nginx proxies /api itself,
# so the frontend can keep calling relative '/api/...' paths exactly like local dev.
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
