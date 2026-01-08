import pg from 'pg';
import 'dotenv/config';

const EMPLOYEE_IDS_TO_DELETE = [3, 4];

async function cleanupDuplicateEmployees() {
  const prodDatabaseUrl = process.env.PROD_DATABASE_URL;
  
  if (!prodDatabaseUrl) {
    console.error('❌ PROD_DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: prodDatabaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to production database');

    for (const employeeId of EMPLOYEE_IDS_TO_DELETE) {
      console.log(`\n--- Processing employee ID: ${employeeId} ---`);

      const employeeResult = await client.query(
        'SELECT id, name, email, company_id FROM executives WHERE id = $1',
        [employeeId]
      );

      if (employeeResult.rows.length === 0) {
        console.log(`⚠️ Employee ${employeeId} not found, skipping...`);
        continue;
      }

      const employee = employeeResult.rows[0];
      console.log(`Found: ${employee.name} (${employee.email}) - Company ${employee.company_id}`);

      const activePlanCheck = await client.query(
        `SELECT COUNT(*) as count FROM purchased_esims 
         WHERE executive_id = $1 
         AND status IN ('activated', 'active', 'waiting_for_activation')
         AND (metadata->>'isCancelled' IS NULL OR metadata->>'isCancelled' != 'true')`,
        [employeeId]
      );

      if (parseInt(activePlanCheck.rows[0].count) > 0) {
        console.log(`⚠️ Employee ${employeeId} has active plans! Skipping to be safe.`);
        continue;
      }

      console.log(`Deleting plan_history for employee ${employeeId}...`);
      const planHistoryResult = await client.query(
        'DELETE FROM plan_history WHERE executive_id = $1',
        [employeeId]
      );
      console.log(`  Deleted ${planHistoryResult.rowCount} plan_history records`);

      console.log(`Deleting purchased_esims for employee ${employeeId}...`);
      const purchasedEsimsResult = await client.query(
        'DELETE FROM purchased_esims WHERE executive_id = $1',
        [employeeId]
      );
      console.log(`  Deleted ${purchasedEsimsResult.rowCount} purchased_esims records`);

      console.log(`Deleting data_packages for employee ${employeeId}...`);
      const dataPackagesResult = await client.query(
        'DELETE FROM data_packages WHERE executive_id = $1',
        [employeeId]
      );
      console.log(`  Deleted ${dataPackagesResult.rowCount} data_packages records`);

      console.log(`Deleting employee ${employeeId}...`);
      const employeeDeleteResult = await client.query(
        'DELETE FROM executives WHERE id = $1',
        [employeeId]
      );
      console.log(`  Deleted ${employeeDeleteResult.rowCount} employee record`);

      console.log(`✅ Successfully deleted employee ${employeeId} (${employee.name})`);
    }

    console.log('\n✅ Cleanup complete!');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('Disconnected from database');
  }
}

cleanupDuplicateEmployees();
