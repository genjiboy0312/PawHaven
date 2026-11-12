import type { SupabaseClient } from '@supabase/supabase-js';

const PNG_LIMIT = 768 * 1024;

export class HomePostcards {
  constructor(private readonly client: SupabaseClient, private readonly owner: string) {}

  async exists(target: string | undefined, signal: AbortSignal): Promise<boolean> {
    return await this.read(target, false, signal) === '';
  }

  async image(target: string | undefined, signal: AbortSignal): Promise<string | null> {
    const png = await this.read(target, true, signal);
    return png ? 'data:image/png;base64,' + png : null;
  }

  async set(image: Blob | null, signal: AbortSignal): Promise<void> {
    if (image && (image.type !== 'image/png' || image.size > PNG_LIMIT)) throw Error('invalid_postcard');
    const bytes = image ? new Uint8Array(await image.arrayBuffer()) : null;
    let binary = '';
    if (bytes) {
      for (let start = 0; start < bytes.length; start += 8192) {
        binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
      }
    }
    await this.call('set_home_postcard', { p_png: bytes ? btoa(binary) : null }, signal);
  }

  private async read(target: string | undefined, includeImage: boolean, signal: AbortSignal): Promise<string | null> {
    const value = await this.call('read_home_postcard', { p_target: target ?? this.owner, p_include_image: includeImage }, signal);
    if (value === null || value === '' || (typeof value === 'string' && /^iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(value))) return value;
    throw Error('invalid_postcard');
  }

  private async call(name: string, args: Record<string, string | boolean | null>, signal: AbortSignal): Promise<unknown> {
    const request = AbortSignal.any([signal, AbortSignal.timeout(12000)]);
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    const session = data.session;
    if (request.aborted || session?.user.id !== this.owner) throw Error('account_changed');
    const response = await this.client.rpc(name, args).setHeader('Authorization', 'Bearer ' + session.access_token).abortSignal(request);
    if (response.error) throw response.error;
    request.throwIfAborted();
    return response.data;
  }
}
