/**
 * PM2 — misma convención que guachi-intercom (Next.js en fork, logs locales, reinicios controlados).
 * Ajusta `PORT` si convive con otra app en el mismo VPS (p. ej. intercom en 9000).
 */
module.exports = {
  apps: [
    {
      name: "guachi-atc-web",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      cwd: "./",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3010,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3010,
      },
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_file: "./logs/pm2-combined.log",
      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 4000,
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true,
      exp_backoff_restart_delay: 100,
    },
  ],
};
