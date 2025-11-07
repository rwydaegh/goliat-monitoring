const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Checking for result files in database...\n');
  
  // Get all result files
  const resultFiles = await prisma.resultFile.findMany({
    include: {
      assignment: {
        include: {
          superStudy: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
  
  if (resultFiles.length === 0) {
    console.log('❌ No result files found in database.\n');
    console.log('Possible issues:');
    console.log('1. GOLIAT_ASSIGNMENT_ID env var not set when study ran');
    console.log('2. Upload failed silently (check study logs for warnings)');
    console.log('3. Files not found in project_dir after extraction');
    console.log('4. Upload endpoint returned non-200 status');
  } else {
    console.log(`✓ Found ${resultFiles.length} result file(s):\n`);
    
    // Group by super study
    const bySuperStudy = {};
    for (const file of resultFiles) {
      const studyName = file.assignment.superStudy.name;
      if (!bySuperStudy[studyName]) {
        bySuperStudy[studyName] = [];
      }
      bySuperStudy[studyName].push(file);
    }
    
    for (const [studyName, files] of Object.entries(bySuperStudy)) {
      console.log(`\n📦 Super Study: ${studyName}`);
      
      // Group by assignment
      const byAssignment = {};
      for (const file of files) {
        const assignmentId = file.assignmentId;
        if (!byAssignment[assignmentId]) {
          byAssignment[assignmentId] = {
            index: file.assignment.index,
            files: []
          };
        }
        byAssignment[assignmentId].files.push(file);
      }
      
      for (const [assignmentId, data] of Object.entries(byAssignment)) {
        console.log(`  Assignment ${data.index} (${assignmentId.substring(0, 8)}...):`);
        for (const file of data.files) {
          const sizeKB = (file.fileSize / 1024).toFixed(2);
          console.log(`    - ${file.filename} (${sizeKB} KB) - ${file.relativePath || 'root'}`);
        }
      }
    }
  }
  
  // Also check assignments with status COMPLETED but no results
  console.log('\n\nChecking assignments marked COMPLETED but with no results...\n');
  const completedAssignments = await prisma.assignment.findMany({
    where: {
      status: 'COMPLETED'
    },
    include: {
      superStudy: true,
      resultFiles: true
    }
  });
  
  const missingResults = completedAssignments.filter(a => a.resultFiles.length === 0);
  if (missingResults.length > 0) {
    console.log(`⚠️  Found ${missingResults.length} completed assignment(s) with no results:\n`);
    for (const assignment of missingResults) {
      console.log(`  - ${assignment.superStudy.name} - Assignment ${assignment.index} (${assignment.id.substring(0, 8)}...)`);
      console.log(`    Completed at: ${assignment.completedAt || 'N/A'}`);
    }
  } else {
    console.log('✓ All completed assignments have results.');
  }
}

main()
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

