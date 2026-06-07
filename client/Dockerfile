FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build React app
RUN npm run build

# Serve with nginx
FROM nginx:alpine

# Copy built app
COPY --from=builder /app/build /usr/share/nginx/html

# Nginx config for React SPA and API proxy
RUN echo 'server { \
  listen 3000; \
  root /usr/share/nginx/html; \
  index index.html index.htm; \
  \
  location / { \
    try_files $uri $uri/ /index.html; \
  } \
  \
  location /api { \
    proxy_pass http://localhost:5000; \
    proxy_set_header Host $host; \
    proxy_set_header X-Real-IP $remote_addr; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_set_header X-Forwarded-Proto $scheme; \
  } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]