import fs, { writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { analyzeTemplate as runStaticAnalysis } from './analysis/staticAnalysis';
import { analyzeMultipleResources } from './analysis/aiAnalysis';
import axios from 'axios';
import { CloudFormationStack, AnalysisMode } from './analysis/aiAnalysis.type';

const args = process.argv.slice(2);

interface AnalysisOptions {
  useAi?: boolean;
  selectedServices?: string[];
  aiModes?: AnalysisMode[]; // Allow users to select AI analysis modes
}

// Retrieve License Key Securely
const getLicenseKey = (): string | undefined => {
  return process.env.GITHUB_LICENSE_KEY || process.env.LICENSE_KEY;
};

const getSelectedServices = (): string[] | undefined => {
  const selectedServicesArg = args.find((arg) =>
    arg.startsWith('--selected-services=')
  );
  return selectedServicesArg
    ? selectedServicesArg.replace('--selected-services=', '').split(',')
    : undefined;
};

const getAIInsights = (): AnalysisMode[] => {
  const aiInsightsArg = args.find((arg) => arg.startsWith('--ai-insights='));
  return aiInsightsArg
    ? (aiInsightsArg.replace('--ai-insights=', '').split(',') as AnalysisMode[])
    : Object.values(AnalysisMode); // Default to all AI checks
};

// Validate License Key with External API
const validateLicenseWithAPI = async (
  licenseKey: string | undefined
): Promise<boolean> => {
  if (!licenseKey) return false;
  try {
    const response = await axios.post(
      'https://your-license-server.com/validate',
      { licenseKey }
    );
    return response.data.valid;
  } catch (error) {
    console.error('Failed to validate license key with the server:', error);
    return false;
  }
};

// Run CDK Synth and Capture the CloudFormation Output
const synthesizeCdkStack = (): CloudFormationStack => {
  try {
    console.log('🔍 Running CDK Synth...');
    const synthOutput = execSync('cdk synth --json', { encoding: 'utf-8' });
    console.log('✅ CDK Synth complete. Parsing output...');
    return JSON.parse(synthOutput);
  } catch (error) {
    console.error(
      '❌ CDK Synth failed. Ensure you have a valid AWS CDK project.'
    );
    console.error('👉 Try running `cdk synth` manually to debug the issue.');
    process.exit(1);
  }
};

// Run Analysis Function
const runAnalysis = async (): Promise<void> => {
  console.log('Starting CloudFormation analysis...');

  // Run CDK Synth to get CloudFormation template
  const template: CloudFormationStack = synthesizeCdkStack();

  // Run Static Analysis
  console.log('Running static analysis...');
  const selectedServices = getSelectedServices();
  const staticAnalysisFindings = runStaticAnalysis(template, selectedServices);

  const licenseKey = getLicenseKey();

  if (!licenseKey) {
    writeFileSync(
      'ai_analysis_report.json',
      JSON.stringify(staticAnalysisFindings, null, 2)
    );
    console.info(
      'For deeper, AI-powered analysis, provide a valid license key.'
    );
  }

  //   const isValidLicense = await validateLicenseWithAPI(licenseKey);

  //   if (!isValidLicense) {
  //     console.error(
  //       'Invalid or missing license key. AI analysis is only available for paid users.'
  //     );
  //     process.exit(1);
  //   }

  console.log('Running AI analysis...');

  // Run AI analysis in batch mode for all resources
  const aiModes = getAIInsights();
  const normalizeServiceName = (type: string): string => {
    return type.split('::')[1]?.toLowerCase(); // Extracts 'Lambda' from 'AWS::Lambda::Function'
  };

  const filteredResources = selectedServices
    ? Object.fromEntries(
        Object.entries(template.Resources).filter(([_, resource]) =>
          selectedServices.some(
            (service) =>
              normalizeServiceName(resource.Type) === service.toLowerCase()
          )
        )
      )
    : template.Resources;

  const aiFindings = await analyzeMultipleResources(filteredResources, aiModes);
  const combinedFindings = { ...staticAnalysisFindings, ...aiFindings };

  // Save AI findings to a JSON report
  console.log(
    'AI analysis complete. Findings saved to ai_analysis_report.json'
  );
  writeFileSync(
    'ai_analysis_report.json',
    JSON.stringify(combinedFindings, null, 2)
  );
  console.log('Analysis complete.');
};

runAnalysis();
