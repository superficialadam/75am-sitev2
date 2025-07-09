#!/usr/bin/env node

/**
 * Development script that uses DATABASE_PUBLIC_URL for local development
 * This allows connecting to Railway's public database URL from local machine
 */

const { spawn } = require('child_process');
const path = require('path');

// Set DATABASE_URL to DATABASE_PUBLIC_URL for local development
if (process.env.DATABASE_PUBLIC_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
  console.log('✅ Using DATABASE_PUBLIC_URL for local development');
} else {
  console.warn('⚠️  DATABASE_PUBLIC_URL not found in environment variables');
  console.warn('   Make sure you have Railway environment variables loaded');
}

// Get the command from arguments
const command = process.argv[2] || 'dev';
const args = process.argv.slice(3);

let cmd, cmdArgs;

switch (command) {
  case 'dev':
    cmd = 'next';
    cmdArgs = ['dev', ...args];
    break;
  case 'db:push':
    cmd = 'prisma';
    cmdArgs = ['db', 'push', ...args];
    break;
  case 'db:studio':
    cmd = 'prisma';
    cmdArgs = ['studio', ...args];
    break;
  case 'db:generate':
    cmd = 'prisma';
    cmdArgs = ['generate', ...args];
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.log('Available commands: dev, db:push, db:studio, db:generate');
    process.exit(1);
}

// Spawn the process
const child = spawn(cmd, cmdArgs, {
  stdio: 'inherit',
  shell: true,
  env: process.env
});

// Handle process exit
child.on('close', (code) => {
  process.exit(code);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  child.kill('SIGINT');
}); 