// EventBus.ts

type EventCallback<T = any> = (data: T) => void;

class EventBus {
    private listeners: Map<string, Set<EventCallback>>;

    constructor() {
        this.listeners = new Map();
    }

    on<T = any>(event: string, callback: EventCallback<T>): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);

        return () => this.off(event, callback);
    }

    off<T = any>(event: string, callback: EventCallback<T>): void {
        if (!this.listeners.has(event)) return;
        this.listeners.get(event)!.delete(callback);
        if (this.listeners.get(event)!.size === 0) {
            this.listeners.delete(event);
        }
    }

    emit<T = any>(event: string, data: T): void {
        if (!this.listeners.has(event)) return;
        this.listeners.get(event)!.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in event listener for ${event}:`, error);
            }
        });
    }

    once<T = any>(event: string, callback: EventCallback<T>): void {
        const onceCallback = (data: T) => {
            callback(data);
            this.off(event, onceCallback);
        };
        this.on(event, onceCallback);
    }

    clear(event?: string): void {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
    }

    dispose(): void {
        this.clear();
    }
}

export { EventBus }; 