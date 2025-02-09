import fs from 'fs';
import { AnalysisResult } from '../analysis/aiAnalysis.type';

export const writeAnalysisResultsFile = (analysisResult: AnalysisResult) => {
  fs.writeFileSync(
    'cdk-insights.json',
    JSON.stringify(analysisResult, null, 2)
  );
  fs.unlinkSync('cdk-output.json');
  console.log('📂 Recommendations saved to cdk-insights.json');
};
