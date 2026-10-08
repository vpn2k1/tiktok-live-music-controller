/**
 * The desktop app's shared modules (one source for the pairing link check and
 * the Vietnamese → English texts). They use no DOM or Node APIs.
 */
export { getLanguage, setLanguage, t } from '../../src/shared/i18n';
export { isPairedPage, parsePhoneLink, PHONE_LINK_PATH, type PhoneLink } from '../../src/shared/phoneLink';
