// Simple script to check results via API
const https = require('https');

const SERVER_URL = 'https://goliat-monitoring.up.railway.app';
const SUPER_STUDY_NAME = 'near_field_study_final';

async function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  try {
    console.log(`Checking super study: ${SUPER_STUDY_NAME}\n`);
    
    // Get super study
    const studies = await fetchJSON(`${SERVER_URL}/api/super-studies?name=${encodeURIComponent(SUPER_STUDY_NAME)}`);
    if (!studies || studies.length === 0) {
      console.log('❌ Super study not found');
      return;
    }
    
    const study = studies[0];
    console.log(`✓ Found super study: ${study.name}`);
    console.log(`  ID: ${study.id}`);
    console.log(`  Total assignments: ${study.totalAssignments}`);
    console.log(`  Completed: ${study.completedAssignments}\n`);
    
    // Get assignments
    const assignments = await fetchJSON(`${SERVER_URL}/api/super-studies/${study.id}/assignments`);
    console.log(`Found ${assignments.length} assignment(s):\n`);
    
    let totalFiles = 0;
    for (const assignment of assignments) {
      const status = assignment.status;
      const index = assignment.index;
      const worker = assignment.worker ? `${assignment.worker.hostname || assignment.worker.ipAddress}` : 'unassigned';
      
      console.log(`Assignment ${index}:`);
      console.log(`  Status: ${status}`);
      console.log(`  Worker: ${worker}`);
      console.log(`  Progress: ${assignment.progress}%`);
      
      // Try to get result files count (we'd need an endpoint for this, but let's check completion)
      if (status === 'COMPLETED') {
        console.log(`  ✓ Completed - should have results`);
      } else {
        console.log(`  ⚠️  Not completed yet`);
      }
      console.log('');
    }
    
    console.log('\nTo check if files were uploaded, look for these log messages in your study logs:');
    console.log('  - "Uploading results to web dashboard..."');
    console.log('  - "✓ Results uploaded successfully (X files)"');
    console.log('  - "WARNING: Results upload failed..."');
    console.log('  - "WARNING: No result files found to upload"');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();

