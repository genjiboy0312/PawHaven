import type { SupabaseClient } from '@supabase/supabase-js';

const PNG_LIMIT = 768 * 1024;
const PNG_BASE64 = /^iVBORw0KGgo[A-Za-z0-9+/=]+$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const NICKNAME = /^[A-Za-z0-9가-힣_]{2,16}$/;

export interface PostcardFrame {
  url: string;
  revision?: string;
  stamped: boolean;
  visitors: string[];
}

export class HomePostcards {
  constructor(private readonly client: SupabaseClient, private readonly owner: string) {}

  async exists(target: string | undefined, signal: AbortSignal): Promise<boolean> {
    return await this.read(target, false, signal) === '';
  }

  async frame(target: string | undefined, signal: AbortSignal): Promise<PostcardFrame | null> {
    let value: unknown;
    try {
      value = await this.call('read_home_postcard_frame', { p_target: target ?? this.owner }, signal);
    } catch (error) {
      // Keep existing postcards viewable while the server migration is being applied.
      if (!['PGRST202', '42883'].includes((error as { code?: string })?.code ?? '')) throw error;
      const png = await this.read(target, true, signal);
      return png ? { url: 'data:image/png;base64,' + png, stamped: false, visitors: [] } : null;
    }
    if (value === null) return null;
    const frame = value as { revision?: unknown; image?: unknown; stamped?: unknown; visitors?: unknown };
    if (typeof frame.image !== 'string' || !PNG_BASE64.test(frame.image) ||
        typeof frame.revision !== 'string' || !UUID.test(frame.revision) || typeof frame.stamped !== 'boolean' ||
        !Array.isArray(frame.visitors) || frame.visitors.length > 3 ||
        !frame.visitors.every(name => typeof name === 'string' && NICKNAME.test(name))) throw Error('invalid_postcard');
    return {
      url: 'data:image/png;base64,' + frame.image,
      revision: frame.revision,
      stamped: frame.stamped,
      visitors: target === undefined ? frame.visitors : [],
    };
  }

  async stamp(target: string, revision: string, signal: AbortSignal): Promise<boolean> {
    const saved = await this.call('stamp_home_postcard', { p_target: target, p_revision: revision }, signal);
    if (typeof saved !== 'boolean') throw Error('invalid_postcard_stamp');
    return saved;
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
    if (value === null || value === '' || (typeof value === 'string' && PNG_BASE64.test(value))) return value;
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
