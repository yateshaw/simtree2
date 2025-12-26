
import { esimAccessService } from "./services/esim-access";
import { storage } from "./storage";

async function syncPlans() {
  try {
    console.log('Starting sync...');
    const result = await esimAccessService.syncPlansWithDatabase(storage);
    console.log('Sync completed:', result);
    process.exit(0);
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

syncPlans();
