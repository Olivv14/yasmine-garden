// Private, memory-only avatars. No UI, persistence, signed/public URLs or identity lookup.
export const AVATAR_BUCKET = 'connection-avatars';
export const AVATAR_MAX_BYTES = 1_048_576;
export const AVATAR_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isUUID = value => typeof value === 'string' && uuidPattern.test(value);
const allowedMime = mime => AVATAR_MIME_TYPES.includes(mime);

export class AvatarError extends Error {
  constructor(code, {stage = null, serverCode = null, recovery = null} = {}) {
    super(code);
    this.name = 'AvatarError';
    this.code = code;
    this.stage = stage;
    this.serverCode = serverCode;
    this.recovery = recovery;
  }
}
const fail = (code, fields) => { throw new AvatarError(code, fields); };
const coded = (error, stage, recovery = 'retry_same_intent') => error instanceof AvatarError ? error :
  new AvatarError('AVATAR_REQUEST_FAILED', {stage, serverCode: String(error?.code ?? error?.statusCode ?? 'UNKNOWN'), recovery});
function checked(response) {
  if (!response || typeof response !== 'object' || !Object.hasOwn(response, 'error')) fail('AVATAR_RESPONSE_INVALID');
  if (response.error) throw response.error;
  return response.data;
}
function composite(data) {
  const row = Array.isArray(data) && data.length === 1 ? data[0] : data;
  if (!row || typeof row !== 'object' || Array.isArray(row)) fail('AVATAR_RESPONSE_INVALID');
  return row;
}
function inputFile(file) {
  if (!(file instanceof Blob)) fail('AVATAR_FILE_REQUIRED');
  if (['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'].includes(file.type)) fail('AVATAR_HEIC_UNSUPPORTED');
  if (!allowedMime(file.type)) fail('AVATAR_TYPE_UNSUPPORTED');
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > AVATAR_MAX_BYTES) fail('AVATAR_SIZE_INVALID');
}
function signature(bytes, mime) {
  const text = (a, b) => String.fromCharCode(...bytes.slice(a, b));
  if (mime === 'image/png') return [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n);
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === 'image/gif') return ['GIF87a', 'GIF89a'].includes(text(0, 6));
  return text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP';
}
/** Browser decoder; injection is a test/platform seam, not permission to skip decoding. */
export async function decodeAvatarImage(blob) {
  if (typeof globalThis.createImageBitmap === 'function') {
    const image = await globalThis.createImageBitmap(blob);
    try { return {width: image.width, height: image.height}; } finally { image.close(); }
  }
  if (typeof globalThis.Image !== 'function' || !globalThis.URL?.createObjectURL) fail('AVATAR_DECODE_UNAVAILABLE');
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    return {width: image.naturalWidth, height: image.naturalHeight};
  } finally { image.src = ''; URL.revokeObjectURL(url); }
}
/** Originals only: signature + real decode, not MIME-only validation or sanitization. */
export async function validateAvatarImage(file, {decode = decodeAvatarImage} = {}) {
  inputFile(file);
  if (!signature(new Uint8Array(await file.slice(0, 12).arrayBuffer()), file.type)) fail('AVATAR_SIGNATURE_MISMATCH');
  let dimensions;
  try { dimensions = await decode(file); } catch (error) {
    if (error instanceof AvatarError) throw error;
    fail('AVATAR_DECODE_FAILED');
  }
  const {width, height} = dimensions ?? {};
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
      width > 16384 || height > 16384 || width * height > 40_000_000) fail('AVATAR_DIMENSIONS_INVALID');
  return Object.freeze({file, mimeType: file.type, sizeBytes: file.size, width, height,
    metadata: Object.freeze({originalBytes: true, reencoded: false, metadataRemoved: false, animationPreserved: true})});
}
function contextValue(value) {
  if (!value || !['authUserId', 'profileId', 'pairId', 'partnerProfileId'].every(key => isUUID(value[key])) ||
      value.profileId === value.partnerProfileId ||
      !Number.isSafeInteger(value.sessionGeneration) || value.sessionGeneration < 0) fail('AVATAR_CONTEXT_INVALID');
  return Object.freeze(Object.fromEntries(['authUserId', 'profileId', 'pairId', 'partnerProfileId', 'sessionGeneration'].map(k => [k, value[k]])));
}
const sameContext = (a, b) => a && b && Object.keys(a).every(k => a[k] === b[k]);
// Only explicit transport unavailability is recoverable; unknown/denied context failures destroy state.
function transientContextFailure(error) {
  if ([401, 403].includes(Number(error?.status ?? error?.statusCode))) return false;
  if (error instanceof AvatarError && error.code !== 'AVATAR_REQUEST_FAILED') return false;
  return ['NETWORK', 'FETCH_ERROR'].includes(error?.serverCode ?? error?.code) ||
    (error?.name === 'AuthRetryableFetchError' && [0, 502, 503, 504].includes(Number(error.status ?? 0)));
}

/** See execution/avatar-module-contract.md for the strict callback/session contract. */
export function createAvatarController({client, getVerifiedContext, isCurrentContext,
  randomUUID = () => globalThis.crypto.randomUUID(), urlApi = globalThis.URL,
  decodeImage = decodeAvatarImage} = {}) {
  if (!client?.rpc || !client?.from || !client?.storage?.from || typeof getVerifiedContext !== 'function' ||
      typeof isCurrentContext !== 'function') fail('AVATAR_DEPENDENCY_INVALID');
  let epoch = 0, binding = null, intent = null, selecting = false;
  const urls = new Map(), photoVersions = new Map(), runs = new Map(), cleanups = new Map();

  function releasePhoto(ownerId) {
    photoVersions.set(ownerId, (photoVersions.get(ownerId) ?? 0) + 1);
    const old = urls.get(ownerId);
    urls.delete(ownerId);
    if (old) urlApi.revokeObjectURL(old.url);
  }
  function clear() {
    epoch++;
    for (const ownerId of [...urls.keys()]) releasePhoto(ownerId);
    photoVersions.clear();
    if (intent) intent.file = null;
    intent = null;
    binding = null;
    selecting = false;
    // Already-dispatched HTTP cannot be recalled. Its continuation is epoch-guarded.
    runs.clear(); cleanups.clear();
  }
  function quarantine() {
    // Invalidate ALL old tickets, even if the host becomes ready again before their awaits return.
    // Keep the exact bound intent/File and in-flight upload/run tracking for safe explicit recovery.
    epoch++;
    for (const ownerId of [...urls.keys()]) releasePhoto(ownerId);
    photoVersions.clear();
    selecting = false;
  }
  function guard(ticket) {
    if (ticket.epoch !== epoch) fail('AVATAR_SESSION_CHANGED', {recovery: 'reverify_context'});
    let current = false;
    try { current = isCurrentContext(ticket.context) === true; } catch { /* Fail closed. */ }
    if (!binding || !sameContext(binding, ticket.context) || !current) {
      clear();
      fail('AVATAR_SESSION_CHANGED', {recovery: 'reverify_context'});
    }
  }
  async function fresh() {
    const e = epoch;
    let value;
    try { value = await getVerifiedContext(); } catch (error) {
      if (e === epoch) {
        if (transientContextFailure(error)) quarantine(); else clear();
      }
      throw coded(error, 'context', 'reverify_context');
    }
    if (e !== epoch) fail('AVATAR_SESSION_CHANGED', {recovery: 'reverify_context'});
    let context;
    try { context = contextValue(value); } catch (error) { clear(); throw error; }
    if (binding && !sameContext(binding, context)) { clear(); fail('AVATAR_SESSION_CHANGED', {recovery: 'reverify_context'}); }
    binding = context;
    const ticket = {epoch: e, context};
    guard(ticket);
    return ticket;
  }
  async function request(ticket, stage, fn) {
    guard(ticket);
    try {
      const response = await fn();
      guard(ticket);
      return checked(response);
    } catch (error) { guard(ticket); throw coded(error, stage); }
  }
  function validateRow(row, ticket, {id, ownerId = ticket.context.profileId} = {}) {
    if (!row || typeof row !== 'object' || !isUUID(row.id) || (id !== undefined && row.id !== id) ||
        row.pair_id !== ticket.context.pairId || row.owner_id !== ownerId ||
        row.object_key !== `${ticket.context.pairId}/${ownerId}/${row.id}` ||
        !allowedMime(row.mime_type) || !['pending','ready','deleting'].includes(row.status) ||
        typeof row.active !== 'boolean' || typeof row.publication_invalidated !== 'boolean' ||
        !(row.expected_active_id === null || isUUID(row.expected_active_id)) ||
        (row.active && row.status !== 'ready')) fail('AVATAR_ROW_INVALID', {recovery: 'refresh_authoritative'});
    if (!Number.isSafeInteger(Number(row.reserved_bytes)) || Number(row.reserved_bytes) <= 0 ||
        Number(row.reserved_bytes) > AVATAR_MAX_BYTES ||
        (row.status === 'pending' && Number(row.reserved_bytes) !== AVATAR_MAX_BYTES)) fail('AVATAR_ROW_INVALID');
    if (row.status === 'ready' && (!Number.isSafeInteger(Number(row.size_bytes)) ||
        Number(row.size_bytes) <= 0 || Number(row.size_bytes) > AVATAR_MAX_BYTES)) fail('AVATAR_ROW_INVALID');
    return {...row};
  }
  function validateIntentRow(row, ticket, op) {
    const result = validateRow(row, ticket, {id: op.id});
    if (result.mime_type !== op.mimeType || result.expected_active_id !== op.expectedActiveId) fail('AVATAR_INTENT_MISMATCH');
    return result;
  }
  async function readRow(ticket, id) {
    if (!isUUID(id)) fail('AVATAR_ID_INVALID');
    const row = await request(ticket, 'read', () => client.from('profile_avatars').select('*').eq('id', id).maybeSingle());
    return row === null ? null : validateRow(row, ticket, {id});
  }
  async function activeRow(ticket, ownerId = ticket.context.profileId) {
    const row = await request(ticket, 'active', () => client.from('profile_avatars').select('*')
      .eq('pair_id', ticket.context.pairId).eq('owner_id', ownerId).eq('status', 'ready').eq('active', true).maybeSingle());
    if (row === null) return null;
    const valid = validateRow(row, ticket, {ownerId});
    if (valid.status !== 'ready' || !valid.active) fail('AVATAR_ROW_INVALID');
    return valid;
  }
  async function rpc(ticket, name, id, args = {p_id: id}) {
    return request(ticket, name, () => client.rpc(name, args));
  }
  function summary(op = intent) {
    return op ? Object.freeze({id: op.id, mimeType: op.mimeType, expectedActiveId: op.expectedActiveId,
      state: op.state, fileRetained: !!op.file, publicationInvalidated: op.invalidated,
      recovery: op.state === 'cleanup_required' || op.deleting ? 'cleanup_only' :
        op.state === 'complete' ? null : op.file ? 'retry_same_intent' : 'finalize_or_discard_reselect_new',
      metadata: op.metadata ?? null}) : null;
  }
  function pendingAllowed() {
    if (selecting || (intent && intent.state !== 'complete')) fail('AVATAR_INTENT_EXISTS', {recovery: 'resolve_existing_intent'});
  }
  function checkOperation(ticket, op) {
    guard(ticket);
    if (intent !== op) fail('AVATAR_INTENT_CHANGED');
    if (op.deleting || op.invalidated || op.state === 'cleanup_required') fail('AVATAR_CLEANUP_REQUIRED', {recovery: 'cleanup_only'});
  }
  function conflict(op, error) {
    if (error.serverCode === '40001') {
      op.state = 'cleanup_required';
      return new AvatarError('AVATAR_PUBLICATION_CONFLICT', {stage: error.stage, serverCode: '40001', recovery: 'cleanup_only'});
    }
    return error;
  }
  async function confirmed(ticket, op, candidate) {
    const returned = validateIntentRow(candidate, ticket, op);
    checkOperation(ticket, op);
    if (returned.status !== 'ready' || !returned.active) fail('AVATAR_NOT_ACTIVE', {recovery: 'cleanup_only'});
    const target = await readRow(ticket, op.id);
    const active = await activeRow(ticket);
    checkOperation(ticket, op);
    if (!target || target.status !== 'ready' || !target.active || active?.id !== op.id) {
      op.state = 'cleanup_required';
      fail('AVATAR_NOT_ACTIVE', {recovery: 'cleanup_only'});
    }
    validateIntentRow(target, ticket, op);
    op.state = 'complete'; op.file = null;
    return Object.freeze({...target});
  }
  async function finalize(ticket, op) {
    const result = composite(await rpc(ticket, 'finalize_avatar', op.id));
    checkOperation(ticket, op);
    return confirmed(ticket, op, result);
  }
  async function execute(ticket, op) {
    try {
      checkOperation(ticket, op);
      op.state = 'reserving';
      const row = validateIntentRow(composite(await rpc(ticket, 'reserve_avatar', op.id, {
        p_id: op.id, p_mime_type: op.mimeType, p_expected_active_id: op.expectedActiveId,
      })), ticket, op);
      checkOperation(ticket, op);
      if (row.publication_invalidated && row.status === 'pending') {
        op.invalidated = true; op.state = 'cleanup_required';
        fail('AVATAR_PUBLICATION_INVALIDATED', {recovery: 'cleanup_only'});
      }
      if (row.status === 'ready') return await confirmed(ticket, op, row);
      if (row.status !== 'pending') {
        op.state = 'cleanup_required'; fail('AVATAR_CLEANUP_REQUIRED', {recovery: 'cleanup_only'});
      }
      if (!op.file) {
        op.state = 'finalizing';
        try { return await finalize(ticket, op); } catch (error) {
          if (error.serverCode === '22023') fail('AVATAR_RESELECTION_REQUIRED', {stage: 'finalize_avatar', serverCode: '22023', recovery: 'discard_then_select_new'});
          throw error;
        }
      }
      inputFile(op.file);
      checkOperation(ticket, op);
      op.state = 'uploading';
      const bytes = op.file;
      // Register the promise synchronously before yielding; deletion marks first then drains this exact upload.
      op.upload = request(ticket, 'upload', () => client.storage.from(AVATAR_BUCKET).upload(row.object_key, bytes, {
        contentType: op.mimeType, upsert: false, cacheControl: '0',
      }));
      let uploadError;
      try { await op.upload; } catch (error) { uploadError = error; } finally { op.upload = null; }
      checkOperation(ticket, op);
      op.state = 'finalizing';
      // Includes upload-conflict / lost-response reconciliation; NEVER overwrite or select a fresh UUID.
      try { return await finalize(ticket, op); } catch (error) {
        if (error.serverCode === '40001' || error.code === 'AVATAR_SESSION_CHANGED' || error.code === 'AVATAR_CLEANUP_REQUIRED') throw error;
        if (uploadError) throw new AvatarError('AVATAR_UPLOAD_UNCONFIRMED', {
          stage: 'upload', serverCode: uploadError.serverCode, recovery: 'retry_same_intent',
        });
        throw error;
      }
    } catch (error) {
      const converted = conflict(op, coded(error, 'operation'));
      if (intent === op && op.state !== 'cleanup_required' && !op.deleting && op.state !== 'complete') op.state = 'interrupted';
      throw converted;
    }
  }
  async function run(ticket, op) {
    checkOperation(ticket, op);
    if (runs.has(op.id)) return runs.get(op.id);
    const task = execute(ticket, op);
    runs.set(op.id, task);
    try { return await task; } finally { if (runs.get(op.id) === task) runs.delete(op.id); }
  }
  async function select(file, {userSelected = false} = {}) {
    if (userSelected !== true) fail('AVATAR_EXPLICIT_SELECTION_REQUIRED');
    pendingAllowed();
    const startEpoch = epoch;
    selecting = true;
    try {
      const ticket = await fresh();
      const validated = await validateAvatarImage(file, {decode: decodeImage});
      guard(ticket);
      const active = await activeRow(ticket);
      guard(ticket);
      const id = randomUUID();
      if (!isUUID(id)) fail('AVATAR_ID_INVALID');
      intent = {id, mimeType: validated.mimeType, expectedActiveId: active?.id ?? null, file,
        metadata: validated.metadata, state: 'selected', invalidated: false, deleting: false, upload: null};
      return summary();
    } catch (error) { throw coded(error, 'select', 'select_supported_file'); }
    finally { if (epoch === startEpoch) selecting = false; }
  }
  async function retry() {
    const ticket = await fresh();
    if (!intent) fail('AVATAR_INTENT_MISSING');
    return run(ticket, intent);
  }
  async function recoverPending(id) {
    if (selecting) fail('AVATAR_INTENT_EXISTS');
    const ticket = await fresh();
    if (intent && intent.id !== id && intent.state !== 'complete') fail('AVATAR_INTENT_EXISTS');
    const row = await readRow(ticket, id);
    if (!row) fail('AVATAR_NOT_FOUND');
    if (selecting || (intent && intent.id !== id && intent.state !== 'complete')) fail('AVATAR_INTENT_EXISTS');
    if (row.status !== 'pending') fail('AVATAR_RECOVERY_STATE_INVALID');
    if (!intent || intent.id !== id) intent = {id, mimeType: row.mime_type, expectedActiveId: row.expected_active_id,
      file: null, state: 'interrupted', invalidated: false, deleting: false, upload: null};
    if (row.publication_invalidated) {
      intent.invalidated = true; intent.state = 'cleanup_required';
      fail('AVATAR_PUBLICATION_INVALIDATED', {recovery: 'cleanup_only'});
    }
    return run(ticket, intent);
  }
  async function listRecovery() {
    const ticket = await fresh(), rows = [];
    for (let start = 0;; start += 200) {
      const page = await request(ticket, 'recovery_list', () => client.from('profile_avatars').select('*')
        .eq('owner_id', ticket.context.profileId).order('created_at').order('id').range(start, start + 199));
      if (!Array.isArray(page)) fail('AVATAR_RESPONSE_INVALID');
      for (const row of page) {
        const own = validateRow(row, ticket);
        if (own.status !== 'ready' || !own.active) rows.push(Object.freeze({...own,
          recovery: own.status === 'deleting' || own.publication_invalidated ? 'cleanup_only' :
            intent?.id === own.id && intent.file ? 'retry_same_intent' : 'finalize_or_discard_reselect_new'}));
      }
      if (page.length < 200) return Object.freeze(rows);
    }
  }
  async function cleanup(id) {
    if (!isUUID(id)) fail('AVATAR_ID_INVALID');
    // Deny new upload/finalize continuations immediately, even while context/mark requests are pending.
    const op = intent?.id === id ? intent : null;
    if (op) { op.deleting = true; op.state = 'cleanup_required'; }
    const ticket = await fresh();
    if (cleanups.has(id)) return cleanups.get(id);
    const task = (async () => {
      const row = await readRow(ticket, id);
      if (!row) {
        // Still call idempotent finish; a concurrent, unacknowledged reservation may not exist yet.
        await rpc(ticket, 'finish_avatar_delete', id);
        if (await readRow(ticket, id)) fail('AVATAR_DELETE_UNCONFIRMED', {recovery: 'cleanup_only'});
        if (op?.upload || runs.has(id)) fail('AVATAR_CLEANUP_RETRY_REQUIRED', {recovery: 'cleanup_only'});
      } else {
        const marked = validateRow(composite(await rpc(ticket, 'mark_avatar_delete', id)), ticket, {id});
        if (marked.status !== 'deleting' || marked.active) fail('AVATAR_ROW_INVALID');
        const afterMark = await readRow(ticket, id);
        if (!afterMark || afterMark.status !== 'deleting' || afterMark.active) fail('AVATAR_ROW_INVALID');
        if (op?.upload) await op.upload.catch(() => {});
        guard(ticket);
        await request(ticket, 'remove', () => client.storage.from(AVATAR_BUCKET).remove([marked.object_key]));
        await rpc(ticket, 'finish_avatar_delete', id);
        if (await readRow(ticket, id)) fail('AVATAR_DELETE_UNCONFIRMED', {recovery: 'cleanup_only'});
      }
      guard(ticket);
      if (intent?.id === id) { intent.file = null; intent = null; }
      releasePhoto(ticket.context.profileId);
      return Object.freeze({id, state: 'deleted'});
    })();
    cleanups.set(id, task);
    try { return await task; } finally { if (cleanups.get(id) === task) cleanups.delete(id); }
  }
  async function loadPhoto(ownerId) {
    // Acquire cancellation/supersession ownership synchronously, BEFORE fresh() can yield.
    releasePhoto(ownerId);
    const version = photoVersions.get(ownerId);
    const ticket = await fresh();
    const current = () => { guard(ticket); if (photoVersions.get(ownerId) !== version) fail('AVATAR_PHOTO_SUPERSEDED'); };
    current();
    if (![ticket.context.profileId, ticket.context.partnerProfileId].includes(ownerId)) fail('AVATAR_OWNER_INVALID');
    const row = await activeRow(ticket, ownerId);
    current();
    if (!row) return null;
    const blob = await request(ticket, 'download', () => client.storage.from(AVATAR_BUCKET).download(row.object_key));
    current();
    if (!(blob instanceof Blob) || blob.size <= 0 || blob.size > AVATAR_MAX_BYTES || blob.type !== row.mime_type) fail('AVATAR_DOWNLOAD_INVALID');
    await validateAvatarImage(blob, {decode: decodeImage});
    current();
    const active = await activeRow(ticket, ownerId);
    current();
    if (!active || active.id !== row.id) fail('AVATAR_NOT_ACTIVE', {recovery: 'refresh_authoritative'});
    let url;
    try { url = urlApi.createObjectURL(blob); } catch { fail('AVATAR_OBJECT_URL_FAILED'); }
    try { current(); } catch (error) { urlApi.revokeObjectURL(url); throw error; }
    const photo = Object.freeze({id: row.id, ownerId, url, mimeType: row.mime_type});
    urls.set(ownerId, photo);
    return photo;
  }
  return Object.freeze({select, retry, recoverPending, listRecovery, cleanup, loadPhoto, releasePhoto, clear,
    // Host offline boundaries must kill old tickets even before any verification request fails.
    setUnavailable: quarantine,
    getState: () => summary()});
}
