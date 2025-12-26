import { Router } from "express";
import { db } from "../db";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

/**
 * Debug route to manually trigger an eSIM activation webhook
 * This is purely for testing purposes to simulate receiving a webhook from eSIM Access
 */
router.post("/trigger-esim-activation/:orderId", async (req, res) => {
  try {
    // Security: Check authentication and admin privileges
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    if (!req.user?.isSuperAdmin && req.user?.role !== 'superadmin') {
      return res.status(403).json({ error: "Super admin access required" });
    }
    
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({ error: "Missing orderId parameter" });
    }
    
    // Security: Validate orderId format to prevent injection
    if (typeof orderId !== 'string' || orderId.length < 1 || orderId.length > 50 || !/^[A-Za-z0-9]+$/.test(orderId)) {
      return res.status(400).json({ error: "Invalid orderId format" });
    }
    
    console.log(`[DEBUG] Manually triggering webhook for eSIM order: ${orderId}`);
    
    // Find the corresponding eSIM
    const [esim] = await db
      .select()
      .from(schema.purchasedEsims)
      .where(eq(schema.purchasedEsims.orderId, orderId));
    
    if (!esim) {
      return res.status(404).json({ error: `No eSIM found with orderId: ${orderId}` });
    }
    
    // Construct a fake webhook payload
    const webhookPayload = {
      orderNo: orderId,
      esimStatus: "ACTIVATED", // simulate activation status
      eventType: "ACTIVATION",
      timestamp: new Date().toISOString(),
    };
    
    console.log(`[DEBUG] Simulating webhook payload:`, JSON.stringify(webhookPayload));
    
    // Make an internal HTTP request to the webhook endpoint
    const response = await fetch(`${req.protocol}://${req.get('host')}/api/esim/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Webhook': 'true'
      },
      body: JSON.stringify(webhookPayload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({
        error: "Error triggering webhook internally",
        details: errorText,
        status: response.status
      });
    }
    
    const result = await response.json();
    return res.status(200).json({
      success: true,
      message: `Successfully triggered webhook for eSIM order ${orderId}`,
      webhookResponse: result
    });
    
  } catch (error) {
    console.error("[DEBUG] Error triggering webhook:", error);
    return res.status(500).json({ error: "Internal error triggering webhook" });
  }
});

export default router;