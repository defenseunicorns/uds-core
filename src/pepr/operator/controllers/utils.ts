import { brotliCompress, brotliDecompress } from "zlib";
import { promisify } from "util";

/**
 * Sanitize a resource name to make it a valid Kubernetes resource name.
 *
 * @param name the name of the resource to sanitize
 * @returns the sanitized resource name
 */
export function sanitizeResourceName(name: string) {
  return (
    name
      // The name must be lowercase
      .toLowerCase()
      // Replace sequences of non-alphanumeric characters with a single '-'
      .replace(/[^a-z0-9]+/g, "-")
      // Truncate the name to 250 characters
      .slice(0, 250)
      // Remove leading and trailing non-letter characters
      .replace(/^[^a-z]+|[^a-z]+$/g, "")
  );
}

/**
 * Compresses a string or buffer using Brotli algorithm.
 * @param {Buffer | string} input - The input data to compress. Can be a string or a Buffer.
 * @returns {Promise<Buffer>} A promise that resolves with the compressed data as a Buffer.
 */
export const compress = promisify(brotliCompress);

/**
 * Decompresses a Brotli-compressed buffer.
 * @param {Buffer} inputBuffer - The Brotli-compressed data to decompress.
 * @returns {Promise<Buffer>} A promise that resolves with the decompressed data as a Buffer.
 */
export const decompress = promisify(brotliDecompress);
