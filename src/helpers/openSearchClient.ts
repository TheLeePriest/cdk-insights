import { SignatureV4 } from '@aws-sdk/signature-v4';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';

const OPENSEARCH_ENDPOINT = process.env.OPENSEARCH_ENDPOINT || '';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

/**
 * Signs HTTP requests for OpenSearch Serverless authentication.
 */
const signRequest = async (request: HttpRequest) => {
  const signer = new SignatureV4({
    credentials: defaultProvider(),
    region: AWS_REGION,
    service: 'aoss',
    sha256: Sha256,
  });

  return signer.sign(request);
};

/**
 * Sends a signed HTTP request to OpenSearch Serverless.
 */
export const sendOpenSearchRequest = async (
  method: string,
  path: string,
  body?: any
) => {
  const request = new HttpRequest({
    method,
    hostname: new URL(OPENSEARCH_ENDPOINT).hostname,
    path,
    headers: {
      'Content-Type': 'application/json',
      host: new URL(OPENSEARCH_ENDPOINT).hostname,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const signedRequest = await signRequest(request);
  return fetch(OPENSEARCH_ENDPOINT + path, {
    method,
    headers: signedRequest.headers,
    body: signedRequest.body,
  }).then((res) => res.json());
};
