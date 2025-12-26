import { Router } from "express";
import { db } from "../db";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";
import { emitEvent, EventTypes } from "../sse";

const router = Router();

// Este endpoint debe ser registrado en eSIM Access como webhook
router.post("/esim/webhook", async (req, res) => {
  try {
    const payload = req.body;

    console.log("[Webhook] Recibido webhook de eSIM Access:", payload);

    const esimData = payload?.obj?.esimList?.[0];

    if (!esimData?.orderNo) {
      return res.status(400).json({ error: "Webhook inválido: falta orderNo" });
    }

    const orderId = esimData.orderNo;
    const newStatus = esimData.esimStatus?.toUpperCase();

    console.log(`[Webhook] Estado recibido: ${newStatus} para orden ${orderId}`);

    // Buscar la eSIM por orderId
    const [esim] = await db
      .select()
      .from(schema.purchasedEsims)
      .where(eq(schema.purchasedEsims.orderId, orderId));

    if (!esim) {
      console.warn(`[Webhook] No se encontró eSIM con orderId: ${orderId}`);
      return res.status(404).json({ error: "eSIM no encontrada" });
    }

    // Estados del proveedor que consideramos como activación exitosa
    const activeStates = ["ONBOARD", "IN_USE", "ENABLED", "ACTIVATED"];

    if (activeStates.includes(newStatus) && esim.status !== "activated") {
      console.log(`[Webhook] Actualizando eSIM ${esim.id} a estado 'activated'`);

      await db
        .update(schema.purchasedEsims)
        .set({
          status: "activated",
          activationDate: new Date(),
          metadata: {
            ...(esim.metadata || {}),
            syncedAt: new Date().toISOString(),
            providerStatus: newStatus,
            previousStatus: esim.status,
            viaWebhook: true,
          },
        })
        .where(eq(schema.purchasedEsims.id, esim.id));

      // Emitir evento SSE si corresponde
      emitEvent(EventTypes.ESIM_STATUS_CHANGE, {
        esimId: esim.id,
        oldStatus: esim.status,
        newStatus: "activated",
        employeeId: esim.employeeId,
        orderId: esim.orderId,
        providerStatus: newStatus,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[Webhook] Error procesando el webhook:", error);
    return res.status(500).json({ error: "Error interno al procesar webhook" });
  }
});

export default router;
