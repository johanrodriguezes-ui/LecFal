const fs = require('fs');
const path = require('path');
const storage = require('./storage');

class AppLogger {
  constructor() {
    this.logFilePath = null;
    this.memoryLogs = [];
    this.maxMemoryLogs = 500;
    this.webContents = null;
    this.pendingUILogs = [];
    this.uiFlushTimer = null;
  }

  init(logTarget) {
    if (logTarget) {
      if (path.extname(logTarget) === '.log') {
        this.logFilePath = logTarget;
      } else {
        this.logFilePath = path.join(logTarget, 'lecfal.log');
      }
    } else {
      this.logFilePath = storage.getLogFilePath();
    }

    try {
      const logDir = path.dirname(this.logFilePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      fs.appendFileSync(this.logFilePath, `\n=== LecFal Sesión iniciada: ${new Date().toISOString()} ===\n`);
    } catch (e) {
      console.error('Error initializing log file:', e);
    }
  }

  setWebContents(webContents) {
    this.webContents = webContents;
  }

  flushUILogs() {
    this.uiFlushTimer = null;
    if (!this.webContents || this.webContents.isDestroyed() || this.pendingUILogs.length === 0) {
      this.pendingUILogs = [];
      return;
    }
    const batch = this.pendingUILogs;
    this.pendingUILogs = [];
    try {
      this.webContents.send('app:logs', batch);
    } catch (err) {
      // window closed or navigating
    }
  }

  log(level, tag, message, meta = null) {
    const timestamp = new Date().toLocaleTimeString('es-ES', { hour12: false });
    const logEntry = {
      timestamp,
      level, // 'INFO', 'SCAN', 'WARN', 'ERROR', 'PERF'
      tag,
      message,
      meta
    };

    // Keep in memory
    this.memoryLogs.push(logEntry);
    if (this.memoryLogs.length > this.maxMemoryLogs) {
      this.memoryLogs.shift();
    }

    // Format for terminal
    this.printToConsole(logEntry);

    // Write to file
    this.appendToFile(logEntry);

    // Send to UI with batching (avoids flooding IPC during high-volume scans)
    if (this.webContents && !this.webContents.isDestroyed()) {
      this.pendingUILogs.push(logEntry);
      if (!this.uiFlushTimer) {
        this.uiFlushTimer = setTimeout(() => {
          this.flushUILogs();
        }, 100);
      }
    }
  }

  info(tag, message, meta) {
    this.log('INFO', tag, message, meta);
  }

  scan(tag, message, meta) {
    this.log('SCAN', tag, message, meta);
  }

  warn(tag, message, meta) {
    this.log('WARN', tag, message, meta);
  }

  error(tag, message, meta) {
    this.log('ERROR', tag, message, meta);
  }

  perf(tag, message, meta) {
    this.log('PERF', tag, message, meta);
  }

  printToConsole({ timestamp, level, tag, message }) {
    const colors = {
      reset: '\x1b[0m',
      dim: '\x1b[2m',
      info: '\x1b[36m',   // Cyan
      scan: '\x1b[35m',   // Magenta
      warn: '\x1b[33m',   // Yellow
      error: '\x1b[31m',  // Red
      perf: '\x1b[32m'    // Green
    };

    const color = colors[level.toLowerCase()] || colors.info;
    const tagFormatted = tag ? `[${tag}]` : '';
    console.log(`${colors.dim}${timestamp}${colors.reset} ${color}[${level}]${colors.reset} ${colors.dim}${tagFormatted}${colors.reset} ${message}`);
  }

  appendToFile({ timestamp, level, tag, message, meta }) {
    if (!this.logFilePath) return;
    try {
      let line = `[${timestamp}] [${level}] [${tag || 'APP'}] ${message}`;
      if (meta) {
        line += ` | ${JSON.stringify(meta)}`;
      }
      fs.appendFileSync(this.logFilePath, line + '\n');
    } catch (err) {
      // Ignore write error
    }
  }

  getLogs() {
    return this.memoryLogs;
  }

  clearLogs() {
    this.memoryLogs = [];
    this.pendingUILogs = [];
    if (this.uiFlushTimer) {
      clearTimeout(this.uiFlushTimer);
      this.uiFlushTimer = null;
    }
    if (this.logFilePath && fs.existsSync(this.logFilePath)) {
      try {
        fs.writeFileSync(this.logFilePath, `=== Logs reiniciados: ${new Date().toISOString()} ===\n`);
      } catch (e) {}
    }
  }

  getLogPath() {
    return this.logFilePath;
  }
}

// Singleton instance
module.exports = new AppLogger();
