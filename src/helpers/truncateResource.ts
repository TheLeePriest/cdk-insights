import { CloudFormationResource } from '../analysis/aiAnalysis.type';

export const truncateResource = (
  resource: CloudFormationResource,
  maxCharLength: number
) => {
  let jsonString = JSON.stringify(resource, null, 2);
  if (jsonString.length > maxCharLength) {
    console.warn(`⚠️ Resource too large, truncating properties...`);
    jsonString = jsonString.substring(0, maxCharLength) + '\n... (truncated)';
  }
  return JSON.parse(jsonString);
};
