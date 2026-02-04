# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage - just copy build files
FROM alpine:latest

WORKDIR /app

COPY --from=builder /app/dist ./dist

# This container just provides the static files
# They will be served by the backend
CMD ["sh", "-c", "cp -r /app/dist/* /static/ 2>/dev/null || echo 'Static files ready'"]
