/**
 * Lightweight RESTful Request Dispatcher for DataBus.
 */

import {
  DataBusRequest,
  DataBusResponse,
  HttpMethod,
  ApiResponse,
} from '../common/types.js';

export type RouteHandler = (
  req: DataBusRequest
) => Promise<DataBusResponse> | DataBusResponse;

interface RouteEntry {
  readonly method: HttpMethod;
  readonly path: string;
  readonly handler: RouteHandler;
}

export class DataBusRouter {
  private readonly routes: RouteEntry[] = [];

  public register(method: HttpMethod, path: string, handler: RouteHandler): void {
    this.routes.push({ method, path, handler });
  }

  public get(path: string, handler: RouteHandler): void {
    this.register('GET', path, handler);
  }

  public post(path: string, handler: RouteHandler): void {
    this.register('POST', path, handler);
  }

  public put(path: string, handler: RouteHandler): void {
    this.register('PUT', path, handler);
  }

  public delete(path: string, handler: RouteHandler): void {
    this.register('DELETE', path, handler);
  }

  public async dispatch(req: DataBusRequest): Promise<DataBusResponse> {
    const entry = this.routes.find(
      (r) => r.method === req.method && r.path === req.path
    );

    if (!entry) {
      const notFoundBody: ApiResponse<null> = {
        success: false,
        error: `Cannot ${req.method} ${req.path} - Endpoint not found`,
      };
      return { status: 404, body: notFoundBody };
    }

    try {
      return await entry.handler(req);
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Internal Server Error';
      const errorBody: ApiResponse<null> = {
        success: false,
        error: errorMessage,
      };
      return { status: 500, body: errorBody };
    }
  }
}
