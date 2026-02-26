#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# G-Force Server Initialization
# Run once on a fresh Hetzner AX41-NVMe (Ubuntu 22.04 LTS)
#
# Usage:
#   chmod +x scripts/server-init.sh
#   ./scripts/server-init.sh YOUR_DOMAIN
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${1:?Usage: server-init.sh <your-domain>}"
DEPLOY_DIR="/opt/g-force"

echo "── [1/7] System update ──────────────────────────────────────────────────"
apt-get update -qq && apt-get upgrade -y -qq

echo "── [2/7] Install Docker ─────────────────────────────────────────────────"
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
fi

echo "── [3/7] Install Git + utilities ────────────────────────────────────────"
apt-get install -y -qq git curl ufw fail2ban

echo "── [4/7] Configure firewall ─────────────────────────────────────────────"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "── [5/7] Clone repository ───────────────────────────────────────────────"
if [ ! -d "$DEPLOY_DIR" ]; then
    git clone https://github.com/isrc-tracker/GFORCE.git "$DEPLOY_DIR"
fi
cd "$DEPLOY_DIR"

echo "── [6/7] Configure environment ──────────────────────────────────────────"
if [ ! -f .env ]; then
    cp .env.example .env
    API_KEY=$(openssl rand -hex 32)
    sed -i "s|^GFORCE_API_KEY=.*|GFORCE_API_KEY=${API_KEY}|" .env
    sed -i "s|^NEXT_PUBLIC_GFORCE_API_KEY=.*|NEXT_PUBLIC_GFORCE_API_KEY=${API_KEY}|" .env
    echo ""
    echo "  !! Set your API keys in $DEPLOY_DIR/.env before continuing !!"
    echo "  GFORCE_API_KEY has been auto-generated: ${API_KEY}"
    echo ""
fi

echo "── [7/7] Patch nginx domain ─────────────────────────────────────────────"
sed -i "s|REPLACE_WITH_YOUR_DOMAIN|${DOMAIN}|g" nginx/nginx.conf

echo ""
echo "  Server init complete."
echo "  Next steps:"
echo "    1. Edit $DEPLOY_DIR/.env — add ANTHROPIC_API_KEY + OPENAI_API_KEY"
echo "    2. Run: $DEPLOY_DIR/scripts/setup-ssl.sh ${DOMAIN}"
echo "    3. Run: cd $DEPLOY_DIR && docker compose up -d"
