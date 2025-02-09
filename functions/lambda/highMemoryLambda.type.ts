import { z as zod } from 'zod';

export const successResponseSchema = zod.object({
  statusCode: zod.literal(200),
  body: zod.object({
    message: zod.string(),
  }),
});

export const clientErrorResponseSchema = zod.object({
  statusCode: zod.literal(400),
  body: zod.object({
    message: zod.string(),
  }),
});

const responseSchema = zod.discriminatedUnion('statusCode', [
  clientErrorResponseSchema,
  successResponseSchema,
]);

export type ExampleFunctionResponse = zod.infer<typeof responseSchema>;
