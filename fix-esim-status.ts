import { db } from './server/db';
import { purchasedEsims } from './shared/schema';
import { eq } from 'drizzle-orm';

async function updateMisclassifiedEsims() {
  console.log('Checking for eSIMs that should be activated...');
  
  // Find eSIMs that are waiting_for_activation but have metadata indicating activation
  const esims = await db
    .select()
    .from(purchasedEsims)
    .where(eq(purchasedEsims.status, 'waiting_for_activation'));
  
  console.log(`Found ${esims.length} eSIMs with waiting_for_activation status`);
  
  let updatedCount = 0;
  
  for (const esim of esims) {
    try {
      // Check if metadata contains installation time or other activation indicators
      const metadata = esim.metadata as any;
      let shouldActivate = false;
      let reason = '';
      
      if (metadata && typeof metadata === 'object') {
        // Check for installation time in rawData
        if (metadata.rawData?.obj?.esimList?.[0]?.installationTime) {
          const installTime = metadata.rawData.obj.esimList[0].installationTime;
          if (installTime && installTime !== 'null') {
            shouldActivate = true;
            reason = `Installation time: ${installTime}`;
          }
        }
        
        // Check for activation time
        if (!shouldActivate && metadata.rawData?.obj?.esimList?.[0]?.activateTime) {
          const activateTime = metadata.rawData.obj.esimList[0].activateTime;
          if (activateTime && activateTime !== 'null') {
            shouldActivate = true;
            reason = `Activation time: ${activateTime}`;
          }
        }
        
        // Check for ONBOARD status
        if (!shouldActivate && metadata.rawData?.obj?.esimList?.[0]?.esimStatus === 'ONBOARD') {
          shouldActivate = true;
          reason = 'ONBOARD status';
        }
      }
      
      if (shouldActivate) {
        console.log(`Updating eSIM ${esim.id} (order: ${esim.orderId}) to activated - ${reason}`);
        
        await db
          .update(purchasedEsims)
          .set({
            status: 'activated',
            activationDate: new Date(),
            metadata: {
              ...metadata,
              correctedAt: new Date().toISOString(),
              correctionReason: reason,
              previousStatus: 'waiting_for_activation'
            }
          })
          .where(eq(purchasedEsims.id, esim.id));
        
        updatedCount++;
      }
    } catch (error) {
      console.error(`Error processing eSIM ${esim.id}:`, error);
    }
  }
  
  console.log(`Updated ${updatedCount} eSIMs to activated status`);
  process.exit(0);
}

updateMisclassifiedEsims().catch(console.error);