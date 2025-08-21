# Deployment Guide: DigitalOcean Droplet with Auto-Deploy

This guide walks you through setting up automatic deployment of your SFTP server to a DigitalOcean Droplet using GitHub Actions.

## Prerequisites

- DigitalOcean Droplet (Ubuntu 22.04 LTS recommended)
- GitHub repository
- Domain name (optional but recommended)

## Step 1: Initial Droplet Setup

### 1.1 Create and Configure Droplet

1. Create a new Ubuntu 22.04 LTS droplet on DigitalOcean
2. SSH into your droplet:
   ```bash
   ssh root@your-droplet-ip
   ```

3. Update the system:
   ```bash
   apt update && apt upgrade -y
   ```

4. Create a non-root user (recommended):
   ```bash
   adduser deploy
   usermod -aG sudo deploy
   su - deploy
   ```

### 1.2 Set up SSH Keys

On your local machine, generate SSH keys for deployment:
```bash
ssh-keygen -t rsa -b 4096 -C "deployment@your-domain.com" -f ~/.ssh/do_deploy
```

Copy the public key to your droplet:
```bash
ssh-copy-id -i ~/.ssh/do_deploy.pub deploy@your-droplet-ip
```

### 1.3 Run Initial Setup Script

On your droplet, download and run the setup script:
```bash
curl -o deploy.sh https://raw.githubusercontent.com/YOUR_USERNAME/financial-automations/main/scripts/deploy.sh
chmod +x deploy.sh
./deploy.sh
```

**Important**: Update the `REPO_URL` in the script with your actual GitHub repository URL.

## Step 2: Configure GitHub Secrets

In your GitHub repository, go to **Settings** > **Secrets and variables** > **Actions** and add:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `DO_SSH_PRIVATE_KEY` | Contents of `~/.ssh/do_deploy` | Private SSH key for deployment |
| `DO_HOST` | Your droplet IP address | Droplet IP or domain |
| `DO_USER` | `deploy` (or your username) | SSH username |
| `DO_APP_PATH` | `/var/www/financial-automations` | Application directory path |
| `DO_WEB_URL` | `https://your-domain.com` | Your web application URL |
| `SFTP_PORT` | `2222` | SFTP server port |

## Step 3: Configure Production Environment

On your droplet, edit the environment file:
```bash
cd /var/www/financial-automations
sudo nano .env.production
```

Update the values in `.env.production` based on `.env.production.example`.

## Step 4: Set up Domain and SSL (Optional)

### 4.1 Configure Nginx (Recommended)

Install and configure Nginx as a reverse proxy:
```bash
sudo apt install nginx certbot python3-certbot-nginx
```

Create Nginx configuration:
```bash
sudo nano /etc/nginx/sites-available/financial-automations
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/financial-automations /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4.2 Get SSL Certificate

```bash
sudo certbot --nginx -d your-domain.com
```

## Step 5: Test Auto-Deployment

1. Make a change to your code
2. Commit and push to the `main` branch:
   ```bash
   git add .
   git commit -m "Test auto-deployment"
   git push origin main
   ```

3. Check the **Actions** tab in your GitHub repository to monitor the deployment

## Step 6: Monitor and Maintain

### View Application Logs
```bash
# Web application logs
pm2 logs sftp-web

# SFTP server logs
pm2 logs sftp-server

# System logs
sudo journalctl -u nginx -f
```

### Restart Services
```bash
# Restart all PM2 processes
pm2 restart all

# Restart specific service
pm2 restart sftp-web
pm2 restart sftp-server
```

### Database Management
```bash
cd /var/www/financial-automations

# Run migrations
npx prisma migrate deploy

# View database
npx prisma studio
```

## Troubleshooting

### Common Issues

1. **Permission Denied**: Check SSH key configuration and file permissions
2. **Port Already in Use**: Check if services are already running with `pm2 list`
3. **Database Connection Error**: Verify database path and permissions
4. **SFTP Connection Failed**: Check firewall settings and port configuration

### Health Checks

- Web app health: `curl https://your-domain.com/api/health`
- SFTP port check: `nc -z your-droplet-ip 2222`
- PM2 status: `pm2 status`

## Security Considerations

1. **Firewall**: Only open necessary ports
2. **SSH Keys**: Use key-based authentication, disable password auth
3. **SSL**: Always use HTTPS in production
4. **Updates**: Keep system and dependencies updated
5. **Backups**: Regular database and file backups

## File Structure on Droplet

```
/var/www/financial-automations/     # Application code
/var/lib/sftp-server/              # Data directory
├── database.db                   # SQLite database
└── storage/                      # SFTP file storage
/var/log/pm2/                     # Application logs
```

## Next Steps

- Set up monitoring (e.g., UptimeRobot, Datadog)
- Configure automated backups
- Set up log rotation
- Consider using a managed database (PostgreSQL) for production
