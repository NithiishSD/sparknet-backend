import { analyzeContent, applyTrustPenalty } from 'file:///C:/Users/user/Desktop/Sparknet/backend/src/moderation/services/moderationService.js';

async function run() {
  console.log("Starting Moderation test...");
  
  const clean = await analyzeContent("This is a lovely day to code and build software.");
  console.log("Clean Post:", clean);
  console.log("Penalty on clean:", applyTrustPenalty(100, clean.riskScore));
  
  const toxic = await analyzeContent("I want to kill the spam.");
  console.log("Toxic Post:", toxic);
  console.log("Penalty on toxic:", applyTrustPenalty(100, toxic.riskScore));

  const medium = await analyzeContent("some spam message here");
  console.log("Medium Toxic Post:", medium);
  console.log("Penalty on medium:", applyTrustPenalty(40, medium.riskScore));
}

run();
