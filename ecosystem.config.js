module.exports = {
  apps: [
    {
      name: 'sftp-web',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/financial-automations',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: '/var/log/pm2/sftp-web.error.log',
      out_file: '/var/log/pm2/sftp-web.out.log',
      log_file: '/var/log/pm2/sftp-web.combined.log',
      time: true,
    },
    {
      name: 'sftp-server',
      script: 'npm',
      args: 'run sftp',
      cwd: '/var/www/financial-automations',
      env: {
        NODE_ENV: 'production',
        SFTP_HOST: '0.0.0.0',
        SFTP_PORT: 2222,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '/var/log/pm2/sftp-server.error.log',
      out_file: '/var/log/pm2/sftp-server.out.log',
      log_file: '/var/log/pm2/sftp-server.combined.log',
      time: true,
    }
  ],
}
