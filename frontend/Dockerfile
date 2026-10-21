FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

FROM dependencies AS build
COPY frontend ./frontend
COPY packages ./packages
ARG NEXT_PUBLIC_API_BASE_URL=
ARG BACKEND_INTERNAL_URL=http://backend:8000
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV BACKEND_INTERNAL_URL=${BACKEND_INTERNAL_URL}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace frontend

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev --workspace=frontend --include-workspace-root=false && npm cache clean --force
COPY --from=build --chown=node:node /app/frontend/.next ./frontend/.next
RUN mkdir -p frontend/public
COPY --from=build --chown=node:node /app/frontend/next.config.mjs ./frontend/next.config.mjs
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "frontend", "--", "--hostname", "0.0.0.0"]
