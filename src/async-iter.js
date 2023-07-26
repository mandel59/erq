/**
 * @template T
 * @param {AsyncIterable<T>} aiter 
 * @returns {Promise<[T, AsyncIterableIterator<T>]>}
 */
export async function uncons(aiter) {
    const { value } = await aiter[Symbol.asyncIterator]().next();
    return [value, aiter];
}
