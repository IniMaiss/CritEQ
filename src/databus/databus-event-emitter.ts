/**
 * Typed Event Emitter for DataBus notifications.
 */

export type DataBusListener<T = unknown> = (data: T) => void;

export class DataBusEventEmitter {
  private readonly listeners: Map<string, Set<DataBusListener>> = new Map();

  public on<T>(channel: string, listener: DataBusListener<T>): void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel)!.add(listener as DataBusListener);
  }

  public off<T>(channel: string, listener: DataBusListener<T>): void {
    const set = this.listeners.get(channel);
    if (set) {
      set.delete(listener as DataBusListener);
      if (set.size === 0) {
        this.listeners.delete(channel);
      }
    }
  }

  public emit<T>(channel: string, data: T): void {
    const set = this.listeners.get(channel);
    if (set) {
      for (const listener of set) {
        try {
          listener(data);
        } catch (err: unknown) {
          if (channel !== 'error') {
            this.emit('error', err);
          }
        }
      }
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}
