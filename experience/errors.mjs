// Stable typed-code mapping only; never translate by matching Spanish UI strings.
export const DATABASE_ERROR_KEYS=Object.freeze({
  '42501':'errors.forbidden','40001':'errors.conflict','23505':'errors.duplicate',
  '23514':'errors.invalidValue','23502':'errors.required','23503':'errors.unknownQuestion',
  '22023':'errors.arguments','54000':'errors.quota','P0001':'errors.writeRate',
});
export const AUTH_ERROR_KEYS=Object.freeze({
  invalid_credentials:'auth.invalidCredentials',user_not_found:'auth.invalidCredentials',
  validation_failed:'errors.invalidValue',weak_password:'errors.invalidValue',
  session_not_found:'auth.expired',session_expired:'auth.expired',refresh_token_not_found:'auth.expired',
  refresh_token_already_used:'auth.expired',otp_expired:'auth.invalidLink',
  over_request_rate_limit:'auth.rateLimited',over_email_send_rate_limit:'auth.rateLimited',
  request_timeout:'errors.network',signup_disabled:'auth.inviteOnly',
});
export function errorKey(error,{domain='database'}={}) {
  if(!['database','auth'].includes(domain))throw new RangeError('Unknown error domain');
  const code=typeof error?.code==='string'?error.code:'';
  const map=domain==='auth'?AUTH_ERROR_KEYS:DATABASE_ERROR_KEYS;
  if(Object.hasOwn(map,code))return map[code];
  if(error?.name==='QuotaExceededError')return 'errors.localQuota';
  if(error?.status===401)return 'auth.expired';
  if(error?.status===403)return 'errors.forbidden';
  if(error?.status===429)return domain==='auth'?'auth.rateLimited':'errors.writeRate';
  // Unknown provider prose is not silently displayed in a different language.
  // Preserve structured code/status in restricted diagnostics outside this helper.
  return 'common.unknownError';
}
