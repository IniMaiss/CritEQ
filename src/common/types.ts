/**
 * Standard interfaces and contracts for CritEQ.
 */

export interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly meta?: {
    readonly total: number;
    readonly page: number;
    readonly limit: number;
  };
}

export interface Repository<T, CreateDto = Partial<T>, UpdateDto = Partial<T>> {
  findAll(filters?: Record<string, unknown>): Promise<readonly T[]>;
  findById(id: string): Promise<T | null>;
  create(data: CreateDto): Promise<T>;
  update(id: string, data: UpdateDto): Promise<T>;
  delete(id: string): Promise<void>;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface DataBusRequest<TBody = unknown> {
  readonly method: HttpMethod;
  readonly path: string;
  readonly body?: TBody;
  readonly params?: Readonly<Record<string, string>>;
}

export interface DataBusResponse<T = unknown> {
  readonly status: number;
  readonly body: ApiResponse<T>;
}
