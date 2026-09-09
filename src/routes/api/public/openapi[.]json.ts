import { createFileRoute } from '@tanstack/react-router'

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'VibePost Transcriptions API',
    version: '1.0.0',
    description:
      'Authenticated REST API for managing a signed-in user\'s transcriptions. All requests require an `Authorization: Bearer <access token>` header containing a valid session token. Row Level Security ensures a user can only reach their own records.',
  },
  servers: [{ url: '/', description: 'Current deployment' }],
  tags: [{ name: 'Transcriptions' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Transcription: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          transcription_type: { type: 'string', enum: ['live', 'uploaded_file'] },
          text_content: { type: 'string' },
          audio_url: { type: 'string', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'transcription_type', 'text_content', 'created_at'],
      },
      Pagination: {
        type: 'object',
        properties: {
          limit: { type: 'integer' },
          offset: { type: 'integer' },
          total: { type: 'integer' },
        },
      },
      Error: {
        type: 'object',
        properties: { error: { type: 'string' }, details: { type: 'object' } },
        required: ['error'],
      },
    },
    responses: {
      Unauthorized: {
        description: 'Missing or invalid bearer token',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      BadRequest: {
        description: 'Validation failed (Zod)',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Transcription not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/api/transcriptions': {
      get: {
        tags: ['Transcriptions'],
        summary: 'List transcriptions',
        description: 'Returns the signed-in user\'s transcriptions, newest first.',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
          {
            name: 'type',
            in: 'query',
            schema: { type: 'string', enum: ['live', 'uploaded_file'] },
          },
          {
            name: 'search',
            in: 'query',
            description: 'Case-insensitive substring match on the transcript text',
            schema: { type: 'string', maxLength: 200 },
          },
        ],
        responses: {
          '200': {
            description: 'A page of transcriptions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Transcription' },
                    },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/transcriptions/{id}': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      get: {
        tags: ['Transcriptions'],
        summary: 'Get a transcription by id',
        responses: {
          '200': {
            description: 'The transcription',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { data: { $ref: '#/components/schemas/Transcription' } },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Transcriptions'],
        summary: 'Delete a transcription',
        description:
          'Soft-deletes the record (marked as deleted and hidden from reads) and removes the associated audio file from storage. The change is recorded in the audit log.',
        responses: {
          '204': { description: 'Deleted' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/transcriptions/jobs': {
      post: {
        tags: ['Jobs'],
        summary: 'Queue a transcription job',
        description:
          'Accepts an already-uploaded audio file URL, queues asynchronous transcription and immediately returns a job id. The provider calls back to /api/public/transcription-webhook when finished; clients can also poll the job.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['audio_url'],
                properties: {
                  audio_url: { type: 'string', format: 'uri' },
                  storage_path: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '202': {
            description: 'Job accepted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        status: { type: 'string', enum: ['queued', 'processing', 'failed'] },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      get: {
        tags: ['Jobs'],
        summary: 'List transcription jobs',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['queued', 'processing', 'completed', 'failed'] },
          },
        ],
        responses: {
          '200': { description: 'A page of jobs' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/transcriptions/jobs/{jobId}': {
      parameters: [
        { name: 'jobId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      get: {
        tags: ['Jobs'],
        summary: 'Get job status',
        description:
          'Returns the job status and, once completed, the transcript text and the id of the saved transcription. Polling also reconciles the job with the provider if the webhook has not arrived.',
        responses: {
          '200': {
            description: 'Job status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        status: {
                          type: 'string',
                          enum: ['queued', 'processing', 'completed', 'failed'],
                        },
                        transcription_id: { type: 'string', format: 'uuid', nullable: true },
                        text: { type: 'string', nullable: true },
                        error: { type: 'string', nullable: true },
                        created_at: { type: 'string', format: 'date-time' },
                        completed_at: { type: 'string', format: 'date-time', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
  },

} as const

export const Route = createFileRoute('/api/public/openapi.json')({
  server: {
    handlers: {
      GET: async () =>
        Response.json(spec, { headers: { 'Cache-Control': 'public, max-age=300' } }),
    },
  },
})
