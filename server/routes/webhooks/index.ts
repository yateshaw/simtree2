import { Router } from "express";
import esimAccessWebhookRouter from "./esimAccessWebhook";

const router = Router();

// Mount the eSIM Access webhook router
router.use('/esim', esimAccessWebhookRouter);

export default router;