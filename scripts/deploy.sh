#!/bin/bash

# Deployment script for DigitalOcean Droplet
# This script should be run on the droplet to set up the initial deployment

set -e

echo "🚀 Setting up SFTP Server deployment environment..."

# Configuration
APP_NAME="financial-automations"
APP_PATH="/var/www/$APP_NAME"
REPO_URL="https://github.com/dustpickle/$APP_NAME.git"  # Update this
NODE_VERSION="22"
DB_PATH="/var/lib/sftp-server/database.db"
STORAGE_PATH="/var/lib/sftp-server/storage"

# Create application user
echo "👤 Creating application user..."
sudo useradd -r -s /bin/bash -m -d /var/lib/sftp-server sftp-server || echo "User already exists"

# Install Node.js
echo "📦 Installing Node.js $NODE_VERSION..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
echo "🔧 Installing PM2..."
sudo npm install -g pm2

# Create application directory
echo "📁 Setting up application directory..."
sudo mkdir -p $APP_PATH
sudo chown -R $USER:$USER $APP_PATH

# Clone repository
echo "📥 Cloning repository..."
if [ -d "$APP_PATH/.git" ]; then
    cd $APP_PATH
    git pull origin main
else
    git clone $REPO_URL $APP_PATH
    cd $APP_PATH
fi

# Create storage directories
echo "💾 Setting up storage..."
sudo mkdir -p $STORAGE_PATH
sudo mkdir -p $(dirname $DB_PATH)
sudo mkdir -p /var/log/pm2
sudo chown -R sftp-server:sftp-server $STORAGE_PATH
sudo chown -R sftp-server:sftp-server $(dirname $DB_PATH)

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --only=production

# Set up environment file
echo "⚙️ Setting up environment..."
if [ ! -f .env.production ]; then
    cat > .env.production << EOF
NODE_ENV=production
DATABASE_URL=file:${DB_PATH}
SFTP_HOST=0.0.0.0
SFTP_PORT=2222
SFTP_STORAGE_ROOT=${STORAGE_PATH}
NEXTAUTH_URL=https://financialautomations.com
NEXTAUTH_SECRET=$(openssl rand -base64 32)
EOF
    echo "📝 Created .env.production - please update with your actual values!"
fi

# Run initial database setup
echo "🗄️ Setting up database..."
npx prisma generate
npx prisma migrate deploy

# Build the application
echo "🔨 Building application..."
npm run build

# Set up firewall
echo "🔥 Configuring firewall..."
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw allow 3000/tcp    # Next.js (adjust if needed)
sudo ufw allow 2222/tcp    # SFTP
sudo ufw --force enable

# Set up systemd service for PM2
echo "🔧 Setting up PM2 startup..."
pm2 startup systemd -u $USER --hp $HOME
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME

# Start services
echo "🚀 Starting services..."
pm2 start ecosystem.config.js
pm2 save

echo "✅ Deployment setup completed!"
echo ""
echo "Next steps:"
echo "1. Update .env.production with your actual values"
echo "2. Set up your domain and SSL certificate"
echo "3. Configure GitHub secrets for auto-deployment"
echo ""
echo "GitHub Secrets needed:"
echo "- DO_SSH_PRIVATE_KEY: Your SSH private key"
echo "- DO_HOST: Your droplet IP address"
echo "- DO_USER: Your droplet username (usually root or your user)"
echo "- DO_APP_PATH: $APP_PATH"
echo "- DO_WEB_URL: https://financialautomations.com"
echo "- SFTP_PORT: 2222"
