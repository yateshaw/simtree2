/**
 * Cloud Storage Integration for Backups
 * Provides additional ransomware protection by storing backups off-site
 */

import AWS from 'aws-sdk';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

class CloudBackupStorage {
  constructor() {
    this.s3Client = null;
    this.bucketName = process.env.BACKUP_S3_BUCKET;
    this.storageClass = 'STANDARD_IA'; // Infrequent Access for cost savings
    this.initialized = false;
  }

  async initialize() {
    try {
      // Check if AWS credentials are available
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        this.s3Client = new AWS.S3({
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          region: process.env.AWS_REGION || 'us-east-1'
        });

        // Test connection
        await this.s3Client.headBucket({ Bucket: this.bucketName }).promise();
        this.initialized = true;
        console.log('✅ Cloud storage initialized (AWS S3)');
      } else {
        console.log('⚠️  Cloud storage not configured - backups will be local only');
        console.log('To enable cloud backups, set these environment variables:');
        console.log('- AWS_ACCESS_KEY_ID');
        console.log('- AWS_SECRET_ACCESS_KEY');
        console.log('- BACKUP_S3_BUCKET');
        console.log('- AWS_REGION (optional, defaults to us-east-1)');
      }
    } catch (error) {
      console.error('❌ Cloud storage initialization failed:', error.message);
      this.initialized = false;
    }
  }

  async uploadBackup(localBackupPath, metadata) {
    if (!this.initialized) {
      console.log('⚠️  Skipping cloud upload - cloud storage not configured');
      return null;
    }

    try {
      const filename = path.basename(localBackupPath);
      const key = `backups/${metadata.type}/${filename}`;
      
      // Read the backup file
      const fileContent = await fs.readFile(localBackupPath);
      
      // Add additional metadata for ransomware protection
      const uploadParams = {
        Bucket: this.bucketName,
        Key: key,
        Body: fileContent,
        StorageClass: this.storageClass,
        Metadata: {
          'backup-type': metadata.type,
          'backup-timestamp': metadata.timestamp,
          'backup-hash': metadata.hash,
          'original-size': metadata.size.toString(),
          'upload-timestamp': new Date().toISOString()
        },
        // Enable versioning and MFA delete for extra protection
        Tagging: `Environment=production&BackupType=${metadata.type}&Timestamp=${Date.now()}`
      };

      const result = await this.s3Client.upload(uploadParams).promise();
      
      console.log(`☁️  Backup uploaded to cloud: ${key}`);
      console.log(`🔗 Cloud location: ${result.Location}`);
      
      return {
        cloudPath: result.Location,
        key: key,
        etag: result.ETag
      };
      
    } catch (error) {
      console.error('❌ Cloud upload failed:', error);
      throw error;
    }
  }

  async listCloudBackups() {
    if (!this.initialized) {
      return [];
    }

    try {
      const params = {
        Bucket: this.bucketName,
        Prefix: 'backups/',
        MaxKeys: 1000
      };

      const result = await this.s3Client.listObjectsV2(params).promise();
      
      return result.Contents.map(item => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
        storageClass: item.StorageClass,
        etag: item.ETag
      }));
      
    } catch (error) {
      console.error('❌ Failed to list cloud backups:', error);
      return [];
    }
  }

  async downloadBackup(cloudKey, localPath) {
    if (!this.initialized) {
      throw new Error('Cloud storage not initialized');
    }

    try {
      const params = {
        Bucket: this.bucketName,
        Key: cloudKey
      };

      const result = await this.s3Client.getObject(params).promise();
      await fs.writeFile(localPath, result.Body);
      
      console.log(`📥 Backup downloaded from cloud: ${cloudKey} -> ${localPath}`);
      return true;
      
    } catch (error) {
      console.error('❌ Cloud download failed:', error);
      throw error;
    }
  }

  async enableVersioning() {
    if (!this.initialized) {
      console.log('⚠️  Cannot enable versioning - cloud storage not configured');
      return false;
    }

    try {
      const params = {
        Bucket: this.bucketName,
        VersioningConfiguration: {
          Status: 'Enabled',
          MfaDelete: 'Disabled' // Can be enabled for extra security
        }
      };

      await this.s3Client.putBucketVersioning(params).promise();
      console.log('✅ S3 bucket versioning enabled for extra protection');
      return true;
      
    } catch (error) {
      console.error('❌ Failed to enable versioning:', error);
      return false;
    }
  }

  async setupLifecyclePolicy() {
    if (!this.initialized) {
      console.log('⚠️  Cannot setup lifecycle - cloud storage not configured');
      return false;
    }

    try {
      const params = {
        Bucket: this.bucketName,
        LifecycleConfiguration: {
          Rules: [
            {
              ID: 'BackupRetentionPolicy',
              Status: 'Enabled',
              Filter: { Prefix: 'backups/' },
              Transitions: [
                {
                  Days: 30,
                  StorageClass: 'GLACIER'
                },
                {
                  Days: 90,
                  StorageClass: 'DEEP_ARCHIVE'
                }
              ],
              Expiration: {
                Days: 2555 // 7 years retention
              }
            }
          ]
        }
      };

      await this.s3Client.putBucketLifecycleConfiguration(params).promise();
      console.log('✅ Lifecycle policy configured for cost optimization');
      return true;
      
    } catch (error) {
      console.error('❌ Failed to setup lifecycle policy:', error);
      return false;
    }
  }
}

export default CloudBackupStorage;