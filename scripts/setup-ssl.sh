#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# G-Force SSL Setup (Let's Encrypt via Certbot)
# Run after server-init.sh and BEFORE starting docker-compose.
#
# Usage: ./scripts/setup-ssl.sh YOUR_DOMAIN your@email.com
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${1:?Usage: setup-ssl.sh <domain> <email>}"
EMAIL="${2:?Usage: setup-ssl.sh <domain> <email>}"
DEPLOY_DIR="/opt/g-force"

cd "$DEPLOY_DIR"

echo "── Starting temporary nginx (HTTP only) for ACME challenge ─────────────"
# Temporarily serve HTTP only so Certbot can validate domain ownership
cat > /tmp/nginx-acme.conf << 'EOF'
events {}
http {
    server {
        listen 80;
        location /.well-known/acme-challenge/ { root /var/www/certbot; }
        location / { return 200 "ok"; }
    }
}
EOF

docker run -d --name nginx-acme \
    -p 80:80 \
    -v /tmp/nginx-acme.conf:/etc/nginx/nginx.conf:ro \
    -v certbot_www:/var/www/certbot \
    nginx:1.27-alpine

echo "── Requesting SSL certificate for ${DOMAIN} ────────────────────────────"
docker run --rm \
    -v "${DEPLOY_DIR}/nginx/certs:/etc/letsencrypt" \
    -v certbot_www:/var/www/certbot \
    certbot/certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email "${EMAIL}" \
        --agree-tos \
        --no-eff-email \
        -d "${DOMAIN}"

echo "── Stopping temporary nginx ─────────────────────────────────────────────"
docker stop nginx-acme && docker rm nginx-acme

echo ""
echo "  SSL certificate issued successfully."
echo "  Now start the full stack: cd ${DEPLOY_DIR} && docker compose up -d"
