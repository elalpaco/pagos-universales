import cron from "node-cron";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { runTick } from "./services/scheduler.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`PAGOS-UNIVERSALES backend escuchando en :${config.port} (${config.nodeEnv})`);
});

if (config.scheduler.enabled) {
  cron.schedule(config.scheduler.cron, async () => {
    try {
      const result = await runTick(new Date());
      console.log("scheduler tick", result);
    } catch (err) {
      console.error("Error en scheduler tick:", err);
    }
  });
  console.log(`Scheduler activado con cron "${config.scheduler.cron}"`);
} else {
  console.log("Scheduler deshabilitado (SCHEDULER_ENABLED=false)");
}
