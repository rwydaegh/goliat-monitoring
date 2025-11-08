const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const studyId = process.argv[2] || 'f9726047-ceb2-420f-bc4e-86f913c79cb4';
  const studyName = process.argv[3] || 'near_field_study_final';
  
  console.log(`\nChecking study: ${studyName} (${studyId})\n`);
  
  // Get super study with assignments and workers
  const superStudy = await prisma.superStudy.findFirst({
    where: {
      OR: [
        { id: studyId },
        { name: studyName }
      ]
    },
    include: {
      assignments: {
        orderBy: {
          index: 'asc'
        },
        include: {
          worker: {
            select: {
              id: true,
              ipAddress: true,
              hostname: true,
              status: true,
              isStale: true,
              lastSeen: true
            }
          }
        }
      }
    }
  });
  
  if (!superStudy) {
    console.log('❌ Super study not found');
    await prisma.$disconnect();
    return;
  }
  
  console.log(`Study: ${superStudy.name}`);
  console.log(`Total assignments: ${superStudy.totalAssignments}`);
  console.log(`Completed assignments: ${superStudy.completedAssignments}`);
  console.log(`Master progress: ${superStudy.masterProgress.toFixed(1)}%`);
  console.log(`Study status: ${superStudy.status}\n`);
  
  console.log('Assignment Status Breakdown:');
  const statusCounts = {};
  superStudy.assignments.forEach(a => {
    statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
  });
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });
  console.log('');
  
  console.log('Detailed Assignment Status:');
  console.log('─'.repeat(100));
  
  const runningAssignments = [];
  
  superStudy.assignments.forEach(assignment => {
    const workerInfo = assignment.worker 
      ? `${assignment.worker.ipAddress} (${assignment.worker.hostname || 'no hostname'}) - Status: ${assignment.worker.status}, Stale: ${assignment.worker.isStale}, LastSeen: ${assignment.worker.lastSeen}`
      : 'No worker assigned';
    
    const status = assignment.status;
    const isRunning = status === 'RUNNING';
    
    if (isRunning) {
      runningAssignments.push({
        index: assignment.index,
        assignmentId: assignment.id,
        worker: assignment.worker,
        startedAt: assignment.startedAt,
        completedAt: assignment.completedAt,
        progress: assignment.progress
      });
    }
    
    console.log(`Assignment ${assignment.index}: ${status.padEnd(10)} | Worker: ${workerInfo}`);
  });
  
  console.log('─'.repeat(100));
  console.log(`\nRunning assignments: ${runningAssignments.length}`);
  
  if (runningAssignments.length > 0) {
    console.log('\nDetails of RUNNING assignments:');
    runningAssignments.forEach(a => {
      console.log(`\n  Assignment ${a.index} (${a.assignmentId}):`);
      console.log(`    Worker: ${a.worker ? `${a.worker.id} (${a.worker.ipAddress})` : 'None'}`);
      if (a.worker) {
        console.log(`    Worker Status: ${a.worker.status}`);
        console.log(`    Worker Stale: ${a.worker.isStale}`);
        console.log(`    Worker LastSeen: ${a.worker.lastSeen}`);
      }
      console.log(`    Started At: ${a.startedAt || 'Not set'}`);
      console.log(`    Completed At: ${a.completedAt || 'Not set'}`);
      console.log(`    Progress: ${a.progress.toFixed(1)}%`);
      
      // Check if worker actually has this assignment as RUNNING
      if (a.worker) {
        prisma.assignment.findFirst({
          where: {
            workerId: a.worker.id,
            status: 'RUNNING',
            id: a.assignmentId
          }
        }).then(actualAssignment => {
          console.log(`    Worker has this assignment as RUNNING in DB: ${actualAssignment ? 'YES' : 'NO'}`);
        });
        
        // Check if worker has ANY RUNNING assignment
        prisma.assignment.findFirst({
          where: {
            workerId: a.worker.id,
            status: 'RUNNING'
          }
        }).then(anyRunning => {
          console.log(`    Worker has ANY RUNNING assignment: ${anyRunning ? `YES (${anyRunning.id})` : 'NO'}`);
        });
      }
    });
  }
  
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});

