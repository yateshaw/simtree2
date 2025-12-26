import { EsimAccessService } from './services/esim-access';

async function countAvailablePlans() {
  try {
    console.log('Initializing eSIM Access service...');
    const esimAccessService = new EsimAccessService();
    
    console.log('Checking connection to eSIM Access API...');
    const connected = await esimAccessService.verifyConnection();
    if (!connected) {
      throw new Error('Could not connect to eSIM Access API');
    }
    
    console.log('Connected to eSIM Access API, fetching available plans...');
    
    // Fetch plans directly from the API
    const plans = await esimAccessService.getAvailablePlans();
    
    console.log(`Total plans from API: ${plans.length}`);
    
    // Get some examples
    console.log('\nExample plans:');
    for (let i = 0; i < Math.min(5, plans.length); i++) {
      console.log(`${i + 1}. ${plans[i].name} (${plans[i].providerId}) - ${plans[i].data}GB ${plans[i].validity} days`);
    }
    
    // Check for duplicate providerIds
    const providerIdCounts = new Map();
    plans.forEach(plan => {
      const count = providerIdCounts.get(plan.providerId) || 0;
      providerIdCounts.set(plan.providerId, count + 1);
    });
    
    const duplicates = [...providerIdCounts.entries()]
      .filter(([_, count]) => count > 1)
      .map(([id, count]) => ({ id, count }));
    
    console.log(`\nFound ${duplicates.length} duplicate provider IDs`);
    if (duplicates.length > 0) {
      console.log('Examples of duplicate provider IDs:');
      for (let i = 0; i < Math.min(5, duplicates.length); i++) {
        console.log(`${duplicates[i].id}: appears ${duplicates[i].count} times`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit();
  }
}

countAvailablePlans();