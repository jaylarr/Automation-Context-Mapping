export class BodyLimitError extends Error {}

export async function readBoundedBody(request: Request, limit: number): Promise<string> {
  const declared = request.headers.get('content-length')
  if (declared && /^\d+$/.test(declared) && Number(declared) > limit) throw new BodyLimitError('Body too large')
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel(); throw new BodyLimitError('Body too large') }
      chunks.push(value)
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
  } finally { reader.releaseLock() }
}
