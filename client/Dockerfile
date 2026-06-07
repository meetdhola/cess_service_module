FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build React app (CRA)
RUN npm run build

# Serve with nginx
FROM nginx:alpine

# Copy built app (from /app/build - not /app/dist)
COPY --from=builder /app/build /usr/share/nginx/html

# React SPA routing + API proxy
RUN cat > /etc/nginx/conf.d/default.conf << 'NGINX'
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  # React Router SPA handling
  location / {
    try_files $uri $uri/ /index.html;
  }

  # API proxy to backend
  location /api/ {
    proxy_pass http://cess-service-module-cessbackend-xquf8p:5000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
  }

  # Cache static assets
  location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # Deny hidden files
  location ~ /\. {
    deny all;
  }
}
NGINX

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]