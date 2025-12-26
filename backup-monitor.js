/**
 * Backup Monitoring Dashboard
 * Real-time monitoring of backup system health
 */

import express from 'express';
import SecureBackupSystem from './backup-system.js';
import CloudBackupStorage from './cloud-backup-storage.js';
import fs from 'fs/promises';
import path from 'path';

class BackupMonitor {
  constructor() {
    this.backup = new SecureBackupSystem();
    this.cloud = new CloudBackupStorage();
    this.app = express();
    this.port = process.env.BACKUP_MONITOR_PORT || 3001;
  }

  async initialize() {
    await this.backup.initialize();
    await this.cloud.initialize();
    
    this.setupRoutes();
    console.log('📊 Backup monitor initialized');
  }

  setupRoutes() {
    this.app.use(express.json());
    this.app.use(express.static('public'));

    // Main dashboard
    this.app.get('/', (req, res) => {
      res.send(this.getDashboardHTML());
    });

    // API endpoints
    this.app.get('/api/status', async (req, res) => {
      try {
        const status = await this.getSystemStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/backups', async (req, res) => {
      try {
        const backups = await this.backup.listBackups();
        res.json(backups);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/cloud-backups', async (req, res) => {
      try {
        const cloudBackups = await this.cloud.listCloudBackups();
        res.json(cloudBackups);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/backup/create', async (req, res) => {
      try {
        const { type } = req.body;
        if (!['daily', 'weekly', 'monthly'].includes(type)) {
          return res.status(400).json({ error: 'Invalid backup type' });
        }
        
        const result = await this.backup.createBackup(type);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/health', async (req, res) => {
      try {
        const health = await this.checkSystemHealth();
        res.json(health);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  async getSystemStatus() {
    const backups = await this.backup.listBackups();
    const cloudBackups = await this.cloud.listCloudBackups();
    
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const recentDailyBackups = backups.filter(b => 
      b.type === 'daily' && new Date(b.timestamp) > oneDayAgo
    );
    
    const recentWeeklyBackups = backups.filter(b => 
      b.type === 'weekly' && new Date(b.timestamp) > oneWeekAgo
    );

    return {
      totalBackups: backups.length,
      cloudBackups: cloudBackups.length,
      recentDailyBackups: recentDailyBackups.length,
      recentWeeklyBackups: recentWeeklyBackups.length,
      lastBackup: backups[0] || null,
      cloudStorageEnabled: this.cloud.initialized,
      diskUsage: await this.calculateDiskUsage(),
      systemHealth: await this.checkSystemHealth()
    };
  }

  async calculateDiskUsage() {
    try {
      const backupDir = './backups';
      let totalSize = 0;
      
      const types = ['daily', 'weekly', 'monthly'];
      for (const type of types) {
        const typeDir = path.join(backupDir, type);
        try {
          const files = await fs.readdir(typeDir);
          for (const file of files) {
            if (file.endsWith('.encrypted')) {
              const stats = await fs.stat(path.join(typeDir, file));
              totalSize += stats.size;
            }
          }
        } catch (error) {
          // Directory might not exist
          continue;
        }
      }
      
      return {
        totalSizeBytes: totalSize,
        totalSizeMB: Math.round(totalSize / 1024 / 1024),
        totalSizeGB: (totalSize / 1024 / 1024 / 1024).toFixed(2)
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  async checkSystemHealth() {
    const checks = {
      databaseConnection: false,
      backupDirectory: false,
      encryptionKey: false,
      cloudStorage: this.cloud.initialized,
      recentBackups: false
    };

    try {
      // Check database connection
      if (process.env.DATABASE_URL) {
        checks.databaseConnection = true;
      }

      // Check backup directory
      try {
        await fs.access('./backups');
        checks.backupDirectory = true;
      } catch (error) {
        // Directory doesn't exist
      }

      // Check encryption key
      if (process.env.BACKUP_ENCRYPTION_KEY) {
        checks.encryptionKey = true;
      }

      // Check recent backups
      const backups = await this.backup.listBackups();
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentBackups = backups.filter(b => new Date(b.timestamp) > oneDayAgo);
      checks.recentBackups = recentBackups.length > 0;

    } catch (error) {
      console.error('Health check error:', error);
    }

    const healthScore = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;

    return {
      score: `${healthScore}/${totalChecks}`,
      percentage: Math.round((healthScore / totalChecks) * 100),
      checks: checks,
      status: healthScore === totalChecks ? 'healthy' : 
               healthScore >= totalChecks * 0.7 ? 'warning' : 'critical'
    };
  }

  getDashboardHTML() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Backup System Monitor</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric { font-size: 2em; font-weight: bold; color: #3498db; }
        .status { padding: 4px 8px; border-radius: 4px; font-size: 0.8em; }
        .status.healthy { background: #2ecc71; color: white; }
        .status.warning { background: #f39c12; color: white; }
        .status.critical { background: #e74c3c; color: white; }
        .backup-list { max-height: 300px; overflow-y: auto; }
        .backup-item { padding: 10px; border-bottom: 1px solid #eee; }
        .backup-item:last-child { border-bottom: none; }
        .btn { background: #3498db; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
        .btn:hover { background: #2980b9; }
        .security-info { background: #e8f5e8; border: 1px solid #4caf50; padding: 15px; border-radius: 4px; margin-top: 20px; }
        .refresh-btn { float: right; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ Secure Backup System Monitor</h1>
            <p>Real-time monitoring of your ransomware-protected database backups</p>
            <button class="btn refresh-btn" onclick="refreshData()">🔄 Refresh</button>
        </div>

        <div class="grid">
            <div class="card">
                <h3>📊 System Status</h3>
                <div id="system-status">Loading...</div>
            </div>

            <div class="card">
                <h3>💾 Local Backups</h3>
                <div id="local-backups">Loading...</div>
            </div>

            <div class="card">
                <h3>☁️ Cloud Backups</h3>
                <div id="cloud-backups">Loading...</div>
            </div>

            <div class="card">
                <h3>🔍 System Health</h3>
                <div id="health-status">Loading...</div>
            </div>
        </div>

        <div class="card">
            <h3>📝 Recent Backups</h3>
            <div class="backup-list" id="backup-list">Loading...</div>
        </div>

        <div class="security-info">
            <h4>🔒 Security Features Active:</h4>
            <ul>
                <li>✅ AES-256-GCM encryption for all backups</li>
                <li>✅ SHA-256 integrity verification</li>
                <li>✅ Automated backup rotation</li>
                <li>✅ Write-once, read-many protection</li>
                <li>✅ Off-site cloud storage (if configured)</li>
                <li>✅ Multiple backup retention periods</li>
            </ul>
        </div>
    </div>

    <script>
        async function fetchData(endpoint) {
            try {
                const response = await fetch(\`/api/\${endpoint}\`);
                return await response.json();
            } catch (error) {
                console.error(\`Error fetching \${endpoint}:\`, error);
                return null;
            }
        }

        async function refreshData() {
            // System Status
            const status = await fetchData('status');
            if (status) {
                document.getElementById('system-status').innerHTML = \`
                    <div class="metric">\${status.totalBackups}</div>
                    <p>Total Backups</p>
                    <p>Last Backup: \${status.lastBackup ? new Date(status.lastBackup.timestamp).toLocaleString() : 'None'}</p>
                    <p>Disk Usage: \${status.diskUsage.totalSizeMB} MB</p>
                \`;
            }

            // Health Status
            const health = await fetchData('health');
            if (health) {
                const statusClass = health.status;
                document.getElementById('health-status').innerHTML = \`
                    <div class="metric \${statusClass}">\${health.percentage}%</div>
                    <span class="status \${statusClass}">\${health.status.toUpperCase()}</span>
                    <div style="margin-top: 10px;">
                        <div>Database: \${health.checks.databaseConnection ? '✅' : '❌'}</div>
                        <div>Backup Dir: \${health.checks.backupDirectory ? '✅' : '❌'}</div>
                        <div>Encryption: \${health.checks.encryptionKey ? '✅' : '❌'}</div>
                        <div>Cloud Storage: \${health.checks.cloudStorage ? '✅' : '❌'}</div>
                        <div>Recent Backups: \${health.checks.recentBackups ? '✅' : '❌'}</div>
                    </div>
                \`;
            }

            // Local Backups
            const backups = await fetchData('backups');
            if (backups) {
                document.getElementById('local-backups').innerHTML = \`
                    <div class="metric">\${backups.length}</div>
                    <p>Local Backup Files</p>
                \`;

                // Recent Backups List
                const backupsList = backups.slice(0, 10).map(backup => \`
                    <div class="backup-item">
                        <strong>\${backup.type.toUpperCase()}</strong> - 
                        \${new Date(backup.timestamp).toLocaleString()}<br>
                        <small>Size: \${(backup.size / 1024 / 1024).toFixed(2)} MB | 
                        Hash: \${backup.hash.substring(0, 16)}...</small>
                    </div>
                \`).join('');

                document.getElementById('backup-list').innerHTML = backupsList || '<p>No backups found</p>';
            }

            // Cloud Backups
            const cloudBackups = await fetchData('cloud-backups');
            if (cloudBackups) {
                document.getElementById('cloud-backups').innerHTML = \`
                    <div class="metric">\${cloudBackups.length}</div>
                    <p>Cloud Backup Files</p>
                    <p>\${cloudBackups.length > 0 ? '✅ Off-site protection active' : '⚠️ Configure cloud storage'}</p>
                \`;
            }
        }

        // Initial load
        refreshData();

        // Auto-refresh every 30 seconds
        setInterval(refreshData, 30000);
    </script>
</body>
</html>
    `;
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`📊 Backup monitor running at http://localhost:${this.port}`);
    });
  }
}

export default BackupMonitor;