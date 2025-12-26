import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

declare global {
  namespace Express {
    interface Request {
      webhookId?: string;
    }
  }
}

export function verifyEsimWebhookSignature(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const signature = req.headers['x-esim-signature'] as string;
  const timestamp = req.headers['x-esim-timestamp'] as string;

  if (!signature || !timestamp) {
    console.error('[Webhook Verification] Missing webhook signature or timestamp');
    return res.status(401).json({ error: 'Missing authentication headers' });
  }

  const webhookTime = parseInt(timestamp);
  const currentTime = Date.now();
  const timeDifference = Math.abs(currentTime - webhookTime);

  if (timeDifference > 300000) {
    console.error(`[Webhook Verification] Webhook timestamp too old: ${timeDifference}ms`);
    return res.status(401).json({ error: 'Webhook expired' });
  }

  const payload = JSON.stringify(req.body);
  const secret = process.env.ESIM_WEBHOOK_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Webhook Verification] ESIM_WEBHOOK_SECRET not configured in production');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    console.warn('[Webhook Verification] ESIM_WEBHOOK_SECRET not configured - skipping signature verification in development');
    next();
    return;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(timestamp + payload)
    .digest('hex');

  try {
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    
    if (signatureBuffer.length !== expectedBuffer.length || 
        !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      console.error('[Webhook Verification] Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } catch (error) {
    console.error('[Webhook Verification] Signature comparison error:', error);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const webhookId = req.body.id || req.body.eventId || req.body.orderNo;
  if (webhookId) {
    req.webhookId = webhookId;
  }

  next();
}
