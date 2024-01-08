import { Log } from "pepr";

import { UDSPackage } from "./crd";
import { reconciler } from "./reconciler";

type QueueItem = {
  pkg: UDSPackage;
  resolve: (value: void | PromiseLike<void>) => void;
  reject: (reason?: string) => void;
};

/**
 * Queue is a FIFO queue for reconciling packages
 */
export class Queue {
  #queue: QueueItem[] = [];
  #pendingPromise = false;

  /**
   * Enqueue adds a package to the queue and returns a promise that resolves when the package is
   * reconciled.
   *
   * @param pkg The package to reconcile
   * @returns A promise that resolves when the package is reconciled
   */
  enqueue(pkg: UDSPackage) {
    Log.debug(`Enqueueing ${pkg.metadata!.namespace}/${pkg.metadata!.name}`);
    return new Promise<void>((resolve, reject) => {
      this.#queue.push({ pkg, resolve, reject });
      return this.#dequeue();
    });
  }

  /**
   * Dequeue reconciles the next package in the queue
   *
   * @returns A promise that resolves when the package is reconciled
   */
  async #dequeue() {
    // If there is a pending promise, do nothing
    if (this.#pendingPromise) return false;

    // Take the next item from the queue
    const item = this.#queue.shift();

    // If there is no item, do nothing
    if (!item) return false;

    try {
      // Set the pending promise flag to avoid concurrent reconciliations
      this.#pendingPromise = true;

      // Reconcile the package
      await reconciler(item.pkg);

      // Reset the pending promise flag and resolve the promise
      this.#pendingPromise = false;
      item.resolve();
    } catch (e) {
      // Reset the pending promise flag and reject the promise on error
      this.#pendingPromise = false;
      item.reject(e);
    } finally {
      // After the package is reconciled, dequeue the next package
      await this.#dequeue();
    }
  }
}
