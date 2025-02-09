export const normalizeResourceType = (resourceType: string): string => {
  return resourceType.replace('AWS::', '').split('::')[0].toUpperCase();
};
