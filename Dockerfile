# Multi-stage build Dockerfile (static front-end build + Nginx serve)
# Stage 1: Build Vite app
FROM node:20-alpine AS build
WORKDIR /app
# Install deps (need dev deps for build)
COPY package.json package-lock.json* ./
RUN npm ci
# Copy all sources
COPY . .
# Build (produces dist/)
RUN npm run build

# Stage 2: Minimal Nginx image to serve static assets
FROM nginx:alpine
# Copy build output
COPY --from=build /app/dist /usr/share/nginx/html
# Expose Cloud Run expected port
EXPOSE 8080
# Adjust default nginx conf to listen on 8080
CMD sh -c "sed -i 's/listen       80;/listen 8080;/' /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"
