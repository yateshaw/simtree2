import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      webhookId?: string;
    }
  }
}

const DEFAULT_ESIM_ACCESS_IPS = '3.1.131.226,54.254.74.88,18.136.190.97,18.136.60.197,18.136.19.137';

function getAllowedIPs(): string[] {
  const ipsFromEnv = process.env.ESIM_ACCESS_ALLOWED_IPS || DEFAULT_ESIM_ACCESS_IPS;
  return ipsFromEnv.split(',').map(ip => ip.trim()).filter(ip => ip.length > 0);
}

function normalizeIP(ip: string): string {
  if (!ip) return '';
  
  let normalized = ip.trim();
  
  if (normalized.startsWith('::ffff:')) {
    normalized = normalized.substring(7);
  }
  
  const lastColon = normalized.lastIndexOf(':');
  if (lastColon > -1 && normalized.includes('.') && !normalized.includes('::')) {
    const potentialIPv4 = normalized.substring(lastColon + 1);
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(potentialIPv4)) {
      normalized = potentialIPv4;
    }
  }
  
  return normalized;
}

function getClientIP(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = (typeof forwardedFor === 'string' ? forwardedFor : forwardedFor[0]).split(',');
    return normalizeIP(ips[0]);
  }
  
  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    const ip = typeof realIP === 'string' ? realIP : realIP[0];
    return normalizeIP(ip);
  }
  
  return normalizeIP(req.ip || req.socket.remoteAddress || '');
}

export function verifyEsimWebhookSignature(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const clientIP = getClientIP(req);
  
  console.log(`[Webhook Verification] Received webhook from IP: ${clientIP}`);
  
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Webhook Verification] Development mode - skipping IP verification');
    const webhookId = req.body?.content?.orderNo || req.body?.orderNo || req.body?.id;
    if (webhookId) {
      req.webhookId = webhookId;
    }
    next();
    return;
  }
  
  const allowedIPs = getAllowedIPs();
  
  const isAllowedIP = allowedIPs.some(allowedIP => clientIP === allowedIP.trim());
  
  if (!isAllowedIP) {
    console.error(`[Webhook Verification] Unauthorized IP: ${clientIP}. Allowed IPs: ${allowedIPs.join(', ')}`);
    return res.status(403).json({ error: 'Unauthorized: IP not in whitelist' });
  }
  
  console.log(`[Webhook Verification] IP ${clientIP} verified successfully`);
  
  const webhookId = req.body?.content?.orderNo || req.body?.orderNo || req.body?.id;
  if (webhookId) {
    req.webhookId = webhookId;
  }

  next();
}
