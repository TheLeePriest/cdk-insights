import { ExampleFunctionResponse } from './highMemoryLambda.type';

export const handler = async (): Promise<ExampleFunctionResponse> => {
  const response: ExampleFunctionResponse = {
    statusCode: 200,
    body: {
      message: 'Hello, World!',
    },
  };

  return response;
};
