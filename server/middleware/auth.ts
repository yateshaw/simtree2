import { Request, Response, NextFunction } from 'express';

export const requireSuperAdmin = (req: any, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required" });
  }

  // Check both role and isSuperAdmin flag for maximum compatibility
  if (req.user.role !== 'superadmin' && req.user.isSuperAdmin !== true) {
    return res.status(403).json({ error: "Super admin access required" });
  }
  
  next();
};

export const requireAdmin = (req: any, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return res.status(403).json({ error: "Admin access required" });
  }
  
  next();
};