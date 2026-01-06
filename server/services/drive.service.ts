import { google } from 'googleapis';
import { Readable } from 'stream';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

interface UploadFileParams {
  name: string;
  mimeType: string;
  readableStream: Readable;
  parents?: string[];
}

interface DriveFile {
  id: string;
  name: string;
  createdTime: string;
  size: string;
}

class DriveService {
  private drive: any = null;
  private initialized: boolean = false;

  private initializeAuth() {
    if (this.initialized) {
      return;
    }

    try {
      // Support both new and old environment variable names for backward compatibility
      const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      
      if (!credentialsJson) {
        throw new Error('[Drive Service] GOOGLE_SERVICE_ACCOUNT_JSON not found in environment');
      }

      const credentials = JSON.parse(credentialsJson);
      
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: SCOPES,
      });

      this.drive = google.drive({ version: 'v3', auth });
      this.initialized = true;
      console.log('[Drive Service] Google Drive authenticated successfully');
    } catch (error) {
      console.error('[Drive Service] Failed to initialize Google Drive:', error);
      throw error;
    }
  }

  private ensureInitialized() {
    if (!this.initialized) {
      this.initializeAuth();
    }
  }

  async uploadFile({ name, mimeType, readableStream, parents, folderId }: UploadFileParams & { folderId?: string }): Promise<{ fileId: string; size: number }> {
    this.ensureInitialized();
    
    try {
      // Support both new and old environment variable names for backward compatibility
      const defaultFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.DRIVE_FOLDER_ID;
      const targetFolderId = folderId || defaultFolderId;
      
      // Sanitize folder IDs - remove any newlines or whitespace that may have been added accidentally
      // Note: Some folder IDs legitimately end with a dash, so only remove newlines and trailing whitespace
      const sanitizeFolderId = (id: string) => id.replace(/\\n-$/, '').replace(/[\n\r]+/g, '').trim();
      
      // Use parents if provided, otherwise use targetFolderId
      let parentFolders = parents || (targetFolderId ? [targetFolderId] : undefined);
      
      // Sanitize all folder IDs
      if (parentFolders) {
        parentFolders = parentFolders.map(id => sanitizeFolderId(id));
      }
      
      if (!parentFolders) {
        throw new Error('GOOGLE_DRIVE_FOLDER_ID environment variable not set and no parents provided');
      }

      const fileMetadata = {
        name,
        parents: parentFolders,
      };

      const media = {
        mimeType,
        body: readableStream,
      };

      console.log(`[Drive Service] Uploading file: ${name} to folder: ${parentFolders[0]}`);

      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, size',
        supportsAllDrives: true,
      });

      console.log(`[Drive Service] File uploaded successfully. ID: ${response.data.id}, Size: ${response.data.size} bytes`);

      return {
        fileId: response.data.id,
        size: parseInt(response.data.size || '0', 10),
      };
    } catch (error) {
      console.error('[Drive Service] Error uploading file:', error);
      throw error;
    }
  }

  async listFiles(folderId?: string): Promise<DriveFile[]> {
    this.ensureInitialized();
    
    try {
      // Support both new and old environment variable names for backward compatibility
      const defaultFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.DRIVE_FOLDER_ID;
      const targetFolderId = folderId || defaultFolderId;
      
      if (!targetFolderId) {
        throw new Error('GOOGLE_DRIVE_FOLDER_ID not specified');
      }

      console.log(`[Drive Service] Listing files in folder: ${targetFolderId}`);

      const response = await this.drive.files.list({
        q: `'${targetFolderId}' in parents and trashed=false`,
        fields: 'files(id, name, createdTime, size)',
        orderBy: 'createdTime desc',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const files: DriveFile[] = response.data.files || [];
      console.log(`[Drive Service] Found ${files.length} files in folder`);

      return files;
    } catch (error) {
      console.error('[Drive Service] Error listing files:', error);
      throw error;
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      console.log(`[Drive Service] Deleting file: ${fileId}`);
      
      await this.drive.files.delete({
        fileId: fileId,
        supportsAllDrives: true,
      });

      console.log(`[Drive Service] File deleted successfully: ${fileId}`);
    } catch (error) {
      console.error(`[Drive Service] Error deleting file ${fileId}:`, error);
      throw error;
    }
  }

  async manageRetention(maxBackups: number = 14, folderId?: string): Promise<void> {
    try {
      const files = await this.listFiles(folderId);
      
      if (files.length <= maxBackups) {
        console.log(`[Drive Service] Retention: ${files.length} backups, no cleanup needed (max: ${maxBackups})`);
        return;
      }

      const filesToDelete = files.slice(maxBackups);
      console.log(`[Drive Service] Retention: Deleting ${filesToDelete.length} old backups`);

      for (const file of filesToDelete) {
        await this.deleteFile(file.id);
        console.log(`[Drive Service] Deleted old backup: ${file.name} (${file.createdTime})`);
      }

      console.log(`[Drive Service] Retention cleanup complete`);
    } catch (error) {
      console.error('[Drive Service] Error managing retention:', error);
      throw error;
    }
  }
}

export const driveService = new DriveService();
