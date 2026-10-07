const path = require('node:path');

// Run the PM2 CLI/daemon with Node 24 (nvm use before starting PM2).
// Pin the app to that absolute interpreter rather than whichever node is on PATH.
if (Number(process.versions.node.split('.')[0]) !== 24) {
  throw new Error('Headcount deployment requires PM2 running under Node 24.');
}

const root = path.resolve(__dirname, '..');

module.exports = {
  apps: [
    {
      name: 'headcount',
      cwd: root,
      script: path.join(root, 'node_modules/next/dist/bin/next'),
      interpreter: process.execPath,
      args: ['start', '--hostname', '127.0.0.1', '--port', '3100'],
      // The operator nonce queue and campaign guards are process-local.
      // Keep exactly one fork. Use `pm2 restart headcount`, never cluster mode,
      // scaling, or zero-downtime reload: the old writer must exit before start.
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      restart_delay: 1000,
      kill_timeout: 30000,
      // Next loads .env.local from cwd. Do not copy secrets into PM2's env.
      // DB_PATH in that file is respected; default ./data/headcount.db persists
      // beneath root, outside .next. Keep data across builds and redeploys.
      env: { NODE_ENV: 'production' },
    },
  ],
};
