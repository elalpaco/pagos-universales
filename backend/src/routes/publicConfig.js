import { Router } from "express";
import { config } from "../config.js";

const router = Router();

router.get("/", (req, res) => {
  const body = { gateway: config.paymentGateway, env: config.nodeEnv };
  if (config.paymentGateway === "wompi") {
    body.wompiPublicKey = config.wompi.publicKey;
    body.wompiApiUrl = config.wompi.apiUrl;
  }
  res.json(body);
});

export default router;
