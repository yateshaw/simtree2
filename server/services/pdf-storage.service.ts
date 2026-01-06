import { Readable } from 'stream';
import { driveService } from './drive.service';

export type DocumentType = 'receipt' | 'invoice' | 'credit-note';

interface StorePdfParams {
  pdfBuffer: Buffer;
  documentType: DocumentType;
  documentNumber: string;
  companyName?: string;
}

interface StorePdfResult {
  fileId: string;
  size: number;
  storedAt: Date;
}

class PdfStorageService {
  private getFolderId(documentType: DocumentType): string | undefined {
    switch (documentType) {
      case 'receipt':
        return process.env.RECEIPTS_DRIVE_FOLDER_ID;
      case 'invoice':
        return process.env.INVOICES_DRIVE_FOLDER_ID;
      case 'credit-note':
        return process.env.CREDIT_NOTES_DRIVE_FOLDER_ID;
      default:
        return undefined;
    }
  }

  private isProductionDatabase(): boolean {
    const databaseUrl = process.env.DATABASE_URL || '';
    const prodDatabaseUrl = process.env.PROD_DATABASE_URL || '';
    
    if (!prodDatabaseUrl) {
      console.log('[PdfStorage] PROD_DATABASE_URL not set, cannot determine if production');
      return false;
    }
    
    const isProduction = databaseUrl === prodDatabaseUrl;
    console.log(`[PdfStorage] Database check - Is production: ${isProduction}`);
    return isProduction;
  }

  async storePdf(params: StorePdfParams): Promise<StorePdfResult | null> {
    const { pdfBuffer, documentType, documentNumber, companyName } = params;

    if (!this.isProductionDatabase()) {
      console.log(`[PdfStorage] Skipping PDF storage for ${documentType} ${documentNumber} - not production database`);
      return null;
    }

    const folderId = this.getFolderId(documentType);
    if (!folderId) {
      console.error(`[PdfStorage] Folder ID not configured for ${documentType}`);
      return null;
    }

    try {
      const sanitizedCompanyName = companyName?.replace(/[^a-zA-Z0-9-_ ]/g, '') || 'unknown';
      
      // Extract prefix (RCP, BILL, CN), date, and sequence from document number
      // Format: RCP-20260106-0001 -> RCP-CompanyName-20260106-0001.pdf
      const parts = documentNumber.split('-');
      const prefix = parts[0]; // RCP, BILL, or CN
      const date = parts.length >= 3 ? parts[1] : '';
      const sequence = parts.length >= 3 ? parts[parts.length - 1] : parts[1] || '0001';
      const fileName = date 
        ? `${prefix}-${sanitizedCompanyName}-${date}-${sequence}.pdf`
        : `${prefix}-${sanitizedCompanyName}-${sequence}.pdf`;

      console.log(`[PdfStorage] Storing ${documentType} PDF: ${fileName} in folder ${folderId}`);

      const readableStream = new Readable();
      readableStream.push(pdfBuffer);
      readableStream.push(null);

      const result = await driveService.uploadFile({
        name: fileName,
        mimeType: 'application/pdf',
        readableStream,
        folderId
      });

      console.log(`[PdfStorage] Successfully stored ${documentType} PDF: ${fileName}, fileId: ${result.fileId}`);

      return {
        fileId: result.fileId,
        size: result.size,
        storedAt: new Date()
      };
    } catch (error) {
      console.error(`[PdfStorage] Error storing ${documentType} PDF:`, error);
      return null;
    }
  }

  async storeReceipt(pdfBuffer: Buffer, receiptNumber: string, companyName?: string): Promise<StorePdfResult | null> {
    return this.storePdf({
      pdfBuffer,
      documentType: 'receipt',
      documentNumber: receiptNumber,
      companyName
    });
  }

  async storeInvoice(pdfBuffer: Buffer, billNumber: string, companyName?: string): Promise<StorePdfResult | null> {
    return this.storePdf({
      pdfBuffer,
      documentType: 'invoice',
      documentNumber: billNumber,
      companyName
    });
  }

  async storeCreditNote(pdfBuffer: Buffer, creditNoteNumber: string, companyName?: string): Promise<StorePdfResult | null> {
    return this.storePdf({
      pdfBuffer,
      documentType: 'credit-note',
      documentNumber: creditNoteNumber,
      companyName
    });
  }
}

export const pdfStorageService = new PdfStorageService();
